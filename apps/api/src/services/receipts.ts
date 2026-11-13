import { getAddress, type Address, type Hex } from "viem";
import { explorerTx, settle, type Payment } from "../chain.js";
import { config } from "../config.js";
import { db } from "../db.js";
import { verifyReceipt } from "../receipt.js";
import { blockCard, findMerchantByAddress, findStudentByUid, uidHashOfCardId } from "./directory.js";

export type ReceiptRow = {
  id: string;
  from_addr: string;
  to_addr: string;
  amount: number;
  status: "pending" | "settled" | "failed";
  reason: string | null;
  tx_hash: string | null;
  sig: string | null;
  card_id: string | null;
  card_nonce: number | null;
  created_at: number;
};

export type ReceiptResult = { id: string; status: string; reason?: string | null; txHash?: string | null; explorer?: string };

/** A card payment as submitted by the POS queue, the student's phone, or read off the card. */
export type ReceiptIn = {
  id: string;
  cardId: string;
  to: string;
  amount: number;
  createdAt: number;
  cardNonce: number;
  sig?: string;
};

const getStmt = db.prepare("SELECT * FROM receipts WHERE id = ?");
const insertStmt = db.prepare(
  `INSERT INTO receipts (id, from_addr, to_addr, amount, sig, card_id, card_nonce, created_at, updated_at)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING`,
);
const updateStmt = db.prepare("UPDATE receipts SET status = ?, reason = ?, tx_hash = ?, updated_at = ? WHERE id = ?");
const sameNonceStmt = db.prepare("SELECT 1 FROM receipts WHERE card_id = ? AND card_nonce = ? AND id != ? LIMIT 1");
const pendingOfCardStmt = db.prepare("SELECT * FROM receipts WHERE card_id = ? AND status = 'pending'");

export const getReceipt = (id: string) => getStmt.get(id) as ReceiptRow | undefined;
export const pendingReceiptsOfCard = (cardId: Hex) => pendingOfCardStmt.all(cardId) as ReceiptRow[];

/** Trusted insert (seed). Normal payments go through submitReceipts. */
export function insertReceipt(r: { id: string; from: Address; to: Address; amount: number; createdAt: number; cardId: Hex; cardNonce: number | null; sig?: Hex }) {
  insertStmt.run(r.id, r.from, r.to, r.amount, r.sig ?? null, r.cardId, r.cardNonce, r.createdAt, Date.now());
  return getReceipt(r.id)!;
}

export const toResult = (row: ReceiptRow): ReceiptResult => ({
  id: row.id,
  status: row.status,
  reason: row.reason,
  txHash: row.tx_hash,
  explorer: row.tx_hash ? explorerTx(row.tx_hash as Hex) : undefined,
});

const reject = (id: string, reason: string): ReceiptResult => ({ id, status: "rejected", reason });

/** Sends one settleBatch for pending receipts and records each outcome. Throws on chain failure. */
export async function settleAndRecord(payments: Payment[]): Promise<ReceiptResult[]> {
  if (payments.length === 0) return [];
  const outcomes = await settle(payments);
  const now = Date.now();
  return [...outcomes].map(([id, o]) => {
    const status = o.status === "failed" ? "failed" : "settled"; // duplicate = settled earlier on-chain
    updateStmt.run(status, o.status === "failed" ? o.reason : null, o.txHash, now, id);
    return toResult(getReceipt(id)!);
  });
}

const toPayment = (row: ReceiptRow): Payment => ({
  id: row.id,
  cardId: row.card_id as Hex,
  to: row.to_addr as Address,
  amount: BigInt(row.amount),
});

/**
 * Validates, records and settles card payments. Idempotent per receipt id.
 * Rejections: UNKNOWN_PARTY, CARD_BLOCKED, STALL_HAS_NO_DEVICE, BAD_SIGNATURE, CONFLICT,
 * STALE_CARD_STATE / DOUBLE_SPEND (card rolled back → card gets blocked).
 * Returns chainError=true when settleBatch failed; those receipts stay pending for a retry.
 */
export async function submitReceipts(receipts: ReceiptIn[]): Promise<{ results: ReceiptResult[]; chainError: boolean }> {
  const results = new Map<string, ReceiptResult>();
  const toSend: Payment[] = [];

  for (const r of receipts) {
    if (results.has(r.id)) continue;
    const to = getAddress(r.to);
    const uidHash = uidHashOfCardId(r.cardId);
    const cardId = `0x${uidHash}` as Hex;
    const student = findStudentByUid(uidHash);
    const merchant = findMerchantByAddress(to);
    if (!student || !merchant) {
      results.set(r.id, reject(r.id, "UNKNOWN_PARTY"));
      continue;
    }

    let row = getReceipt(r.id);
    if (!row) {
      // New receipt: full checks. (Known receipts were checked when first recorded.)
      if (student.blocked) {
        results.set(r.id, reject(r.id, "CARD_BLOCKED"));
        continue;
      }
      if (config.requireReceiptSig) {
        if (!merchant.device_address) {
          results.set(r.id, reject(r.id, "STALL_HAS_NO_DEVICE"));
          continue;
        }
        const signed = { id: r.id, cardId, to, amount: r.amount, createdAt: r.createdAt, cardNonce: r.cardNonce, sig: (r.sig ?? "0x") as Hex };
        if (!(await verifyReceipt(signed, merchant.device_address as Address))) {
          results.set(r.id, reject(r.id, "BAD_SIGNATURE"));
          continue;
        }
      }
      // Each issued card state backs at most one payment. An older state, or a second payment
      // on the same state, means the card's record was copied back (rollback / clone).
      if (r.cardNonce < student.card_nonce || sameNonceStmt.get(cardId, r.cardNonce, r.id)) {
        blockCard(uidHash);
        results.set(r.id, reject(r.id, r.cardNonce < student.card_nonce ? "STALE_CARD_STATE" : "DOUBLE_SPEND"));
        continue;
      }
      row = insertReceipt({
        id: r.id,
        from: student.address as Address,
        to,
        amount: r.amount,
        createdAt: r.createdAt,
        cardId,
        cardNonce: r.cardNonce,
        sig: r.sig as Hex | undefined,
      });
    }

    if (row.card_id !== cardId || row.to_addr !== to || row.amount !== r.amount) {
      results.set(r.id, reject(r.id, "CONFLICT")); // a receipt id is immutable
      continue;
    }
    results.set(r.id, toResult(row));
    if (row.status === "pending") toSend.push(toPayment(row));
  }

  const chainError = await settleOrKeepPending(toSend, results);
  return { results: [...results.values()], chainError };
}

/** Retries any receipts of this card that are recorded but not yet on-chain. */
export async function settlePendingOfCard(cardId: Hex): Promise<{ results: ReceiptResult[]; chainError: boolean }> {
  const results = new Map<string, ReceiptResult>();
  const chainError = await settleOrKeepPending(pendingReceiptsOfCard(cardId).map(toPayment), results);
  return { results: [...results.values()], chainError };
}

async function settleOrKeepPending(payments: Payment[], results: Map<string, ReceiptResult>): Promise<boolean> {
  try {
    for (const result of await settleAndRecord(payments)) results.set(result.id, result);
    return false;
  } catch (err) {
    console.error("settleBatch failed; receipts left pending", err);
    return true;
  }
}

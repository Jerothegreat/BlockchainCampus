import type { Address, Hex } from "viem";
import { explorerTx, settle, type Payment } from "../chain.js";
import { db } from "../db.js";

export type ReceiptRow = {
  id: string;
  from_addr: string;
  to_addr: string;
  amount: number;
  status: "pending" | "settled" | "failed";
  reason: string | null;
  tx_hash: string | null;
  sig: string | null;
  created_at: number;
};

export type ReceiptResult = {
  id: string;
  status: string;
  reason?: string | null;
  txHash?: string | null;
  explorer?: string;
};

const getStmt = db.prepare("SELECT * FROM receipts WHERE id = ?");
const insertStmt = db.prepare(
  `INSERT INTO receipts (id, from_addr, to_addr, amount, sig, created_at, updated_at)
   VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING`,
);
const updateStmt = db.prepare("UPDATE receipts SET status = ?, reason = ?, tx_hash = ?, updated_at = ? WHERE id = ?");

export const getReceipt = (id: string) => getStmt.get(id) as ReceiptRow | undefined;

/** Inserts if new (receipt ID is the idempotency key) and returns the stored row. */
export function upsertReceipt(r: { id: string; from: Address; to: Address; amount: number; createdAt: number; sig?: Hex }) {
  insertStmt.run(r.id, r.from, r.to, r.amount, r.sig ?? null, r.createdAt, Date.now());
  return getReceipt(r.id)!;
}

export const toResult = (row: ReceiptRow): ReceiptResult => ({
  id: row.id,
  status: row.status,
  reason: row.reason,
  txHash: row.tx_hash,
  explorer: row.tx_hash ? explorerTx(row.tx_hash as Hex) : undefined,
});

/** Sends one settleBatch for the given pending receipts and records each outcome. Throws on chain failure. */
export async function settleAndRecord(payments: Payment[]): Promise<ReceiptResult[]> {
  const outcomes = await settle(payments);
  const now = Date.now();
  return [...outcomes].map(([id, o]) => {
    const status = o.status === "failed" ? "failed" : "settled"; // duplicate = settled earlier on-chain
    updateStmt.run(status, o.status === "failed" ? o.reason : null, o.txHash, now, id);
    return toResult(getReceipt(id)!);
  });
}

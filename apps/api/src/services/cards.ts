import type { Address, Hex } from "viem";
import { decodeCard, issueCardState, verifyCardState, type CardRecord } from "../cardstate.js";
import { balanceOf, explorerTx, topUp } from "../chain.js";
import { cardIdOf, findStudentByUid, saveCardNonce, uidHashOf, type StudentRow } from "./directory.js";
import { pendingReceiptsOfCard, settlePendingOfCard, submitReceipts, type ReceiptResult } from "./receipts.js";

/**
 * The card wallet rules. A card's state only changes when:
 *   1. the request is online (it reaches this API),
 *   2. the card has no pending payment (on the card or recorded but unsettled),
 *   3. the request carries the card itself (UID + the record read from it).
 * Every change returns a NEW signed record that the tapping phone must write back to the card.
 */
export class CardError extends Error {
  readonly status: number;
  constructor(status: number, code: string) {
    super(code);
    this.status = status;
  }
}

// One operation per card at a time (refresh / top-up must not interleave).
const locks = new Map<string, Promise<unknown>>();
function withCardLock<T>(uidHash: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(uidHash) ?? Promise.resolve();
  const run = prev.then(fn, fn);
  const tail = run.catch(() => undefined);
  locks.set(uidHash, tail);
  void tail.then(() => locks.get(uidHash) === tail && locks.delete(uidHash));
  return run;
}

type Tapped = { student: StudentRow; uidHash: string; cardId: Hex; record: CardRecord };

/** Rule 3: the request must come from the card — its UID plus a genuine (backend-signed) record. */
async function readTappedCard(uid: string, cardHex: string): Promise<Tapped> {
  const uidHash = uidHashOf(uid);
  const student = findStudentByUid(uidHash);
  if (!student) throw new CardError(404, "CARD_NOT_LINKED");
  const record = decodeCard(cardHex);
  if (!record) throw new CardError(400, "INVALID_CARD_RECORD");
  const cardId = cardIdOf(uidHash);
  if (!(await verifyCardState(cardId, record.state))) throw new CardError(400, "FORGED_CARD_RECORD");
  return { student, uidHash, cardId, record };
}

async function issueNext(t: Tapped) {
  const nonce = Math.max(t.student.card_nonce, t.record.state.nonce) + 1;
  const balance = Number(await balanceOf(t.student.address as Address));
  const card = await issueCardState(t.cardId, balance, nonce);
  saveCardNonce(t.uidHash, nonce);
  return { card, balance, nonce };
}

/**
 * Online tap (student phone, or a POS that is online): settle the payment stored on the card
 * and any queued ones, then issue a fresh clear state with the on-chain balance.
 */
export function refreshCard(uid: string, cardHex: string) {
  return withCardLock(uidHashOf(uid), async () => {
    const t = await readTappedCard(uid, cardHex);
    const settled: ReceiptResult[] = [];

    if (t.record.pending) {
      const p = t.record.pending;
      const { results, chainError } = await submitReceipts([
        { id: p.id, cardId: t.cardId, to: p.to, amount: p.amount, createdAt: p.createdAt, cardNonce: t.record.state.nonce, sig: p.sig },
      ]);
      settled.push(...results);
      if (chainError) throw new CardError(502, "CHAIN_UNAVAILABLE");
    }
    const queued = await settlePendingOfCard(t.cardId);
    settled.push(...queued.results);
    if (queued.chainError) throw new CardError(502, "CHAIN_UNAVAILABLE");

    // Re-read: a rollback detected while settling blocks the card.
    const student = findStudentByUid(t.uidHash)!;
    if (student.blocked) throw new CardError(403, "CARD_BLOCKED");
    return { ...(await issueNext({ ...t, student })), settled };
  });
}

export type TopUpPayment = { method: "cash"; orNumber: string } | { method: "online"; ref: string };

/** Adds funds to the card's wallet. Requires a clear, up-to-date card (refresh first otherwise). */
export function topUpCard(uid: string, cardHex: string, amount: number, payment: TopUpPayment) {
  return withCardLock(uidHashOf(uid), async () => {
    const t = await readTappedCard(uid, cardHex);
    if (t.student.blocked) throw new CardError(403, "CARD_BLOCKED");
    // Rule 2: no pending payment anywhere.
    if (t.record.pending || pendingReceiptsOfCard(t.cardId).length > 0) throw new CardError(409, "CARD_PENDING");
    // The card must hold the latest state; an older one means a failed write or a rollback.
    if (t.record.state.nonce !== t.student.card_nonce) throw new CardError(409, "CARD_STALE");

    const ref = payment.method === "cash" ? payment.orNumber : payment.ref;
    let txHash: Hex;
    try {
      txHash = await topUp(t.cardId, BigInt(amount), ref);
    } catch (err) {
      console.error("topUp failed", err);
      throw new CardError(502, "CHAIN_UNAVAILABLE");
    }
    return { ...(await issueNext(t)), txHash, explorer: explorerTx(txHash), ref };
  });
}

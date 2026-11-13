import type { Address, Hex } from "viem";
import { balanceOf, explorerTx, redeem } from "../chain.js";
import { db } from "../db.js";
import type { MerchantRow } from "./directory.js";

type WithdrawalRow = { id: string; merchant_id: string; amount: number; ref: string; tx_hash: string | null; created_at: number };

const getStmt = db.prepare("SELECT * FROM withdrawals WHERE id = ?");
const insertStmt = db.prepare(
  "INSERT INTO withdrawals (id, merchant_id, amount, ref, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING",
);
const doneStmt = db.prepare("UPDATE withdrawals SET tx_hash = ? WHERE id = ?");
const deleteStmt = db.prepare("DELETE FROM withdrawals WHERE id = ? AND tx_hash IS NULL");
const ofStallStmt = db.prepare("SELECT * FROM withdrawals WHERE merchant_id = ? ORDER BY created_at DESC LIMIT 50");

export class WithdrawError extends Error {
  readonly status: number;
  constructor(status: number, code: string) {
    super(code);
    this.status = status;
  }
}

export const withdrawalView = (w: WithdrawalRow) => ({
  id: w.id,
  amount: w.amount,
  ref: w.ref,
  status: w.tx_hash ? "paid" : "processing",
  txHash: w.tx_hash,
  explorer: w.tx_hash ? explorerTx(w.tx_hash as Hex) : undefined,
  createdAt: w.created_at,
});

export const withdrawalsOf = (merchantId: string) => (ofStallStmt.all(merchantId) as WithdrawalRow[]).map(withdrawalView);

/**
 * Stall cash-out: burns `amount` of the stall's tPHP on-chain (redeem). The payout itself
 * (GCash/bank) is simulated for the demo. `id` is a client UUID, so retries never pay twice.
 */
export async function withdraw(stall: MerchantRow, id: string, amount: number) {
  const existing = getStmt.get(id) as WithdrawalRow | undefined;
  if (existing) {
    if (existing.merchant_id !== stall.id || existing.amount !== amount) throw new WithdrawError(409, "CONFLICT");
    if (!existing.tx_hash) throw new WithdrawError(409, "IN_PROGRESS");
    return withdrawalView(existing);
  }
  if (BigInt(amount) > (await balanceOf(stall.address as Address))) throw new WithdrawError(400, "INSUFFICIENT");

  const ref = `WD-${id.slice(0, 8)}`;
  if (insertStmt.run(id, stall.id, amount, ref, Date.now()).changes === 0) throw new WithdrawError(409, "IN_PROGRESS");
  try {
    const txHash = await redeem(stall.address as Address, BigInt(amount), ref);
    doneStmt.run(txHash, id);
  } catch (err) {
    deleteStmt.run(id); // nothing burned: allow a retry with the same id
    console.error("redeem failed", err);
    throw new WithdrawError(502, "CHAIN_UNAVAILABLE");
  }
  return withdrawalView(getStmt.get(id) as WithdrawalRow);
}

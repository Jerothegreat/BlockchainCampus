import { verifyTypedData, type Address, type Hex } from "viem";
import { config } from "./config.js";

/**
 * Receipts are signed by the stall's POS phone (EIP-712) so nobody can forge a payment just
 * by knowing a student's and a stall's addresses. The student's phone forwards the same
 * signature from the QR. Client side (viem):
 *   privateKeyToAccount(deviceKey).signTypedData({ domain, types: receiptTypes, primaryType: "Receipt", message })
 * with domain/types exactly as below and message = { id, from, to, amount: BigInt(centavos), createdAt: BigInt(ms) }.
 */
export const receiptDomain = {
  name: "UMak Pay",
  version: "1",
  chainId: config.chainId,
  verifyingContract: config.contract,
} as const;

export const receiptTypes = {
  Receipt: [
    { name: "id", type: "string" },
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "amount", type: "uint256" },
    { name: "createdAt", type: "uint64" },
  ],
} as const;

export type SignedReceipt = { id: string; from: Address; to: Address; amount: number; createdAt: number; sig: Hex };

export async function verifyReceipt(r: SignedReceipt, device: Address): Promise<boolean> {
  try {
    return await verifyTypedData({
      address: device,
      domain: receiptDomain,
      types: receiptTypes,
      primaryType: "Receipt",
      message: { id: r.id, from: r.from, to: r.to, amount: BigInt(r.amount), createdAt: BigInt(r.createdAt) },
      signature: r.sig,
    });
  } catch {
    return false; // malformed signature
  }
}

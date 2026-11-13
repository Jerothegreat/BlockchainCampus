import { verifyTypedData, type Address, type Hex } from "viem";
import { config } from "./config.js";

/** EIP-712 domain shared by receipts (signed by POS devices) and card states (signed by the backend). */
export const domain = {
  name: "UMak Pay",
  version: "1",
  chainId: config.chainId,
  verifyingContract: config.contract,
} as const;

/**
 * A card payment, signed by the stall's POS device when the card is tapped (offline OK).
 * `cardNonce` is the nonce of the card state the POS read; two receipts on the same card
 * and nonce mean the card was rolled back (double spend).
 */
export const receiptTypes = {
  Receipt: [
    { name: "id", type: "string" },
    { name: "cardId", type: "bytes32" },
    { name: "to", type: "address" },
    { name: "amount", type: "uint256" },
    { name: "createdAt", type: "uint64" },
    { name: "cardNonce", type: "uint32" },
  ],
} as const;

export type SignedReceipt = {
  id: string;
  cardId: Hex;
  to: Address;
  amount: number;
  createdAt: number;
  cardNonce: number;
  sig: Hex;
};

export async function verifyReceipt(r: SignedReceipt, device: Address): Promise<boolean> {
  try {
    return await verifyTypedData({
      address: device,
      domain,
      types: receiptTypes,
      primaryType: "Receipt",
      message: {
        id: r.id,
        cardId: r.cardId,
        to: r.to,
        amount: BigInt(r.amount),
        createdAt: BigInt(r.createdAt),
        cardNonce: r.cardNonce,
      },
      signature: r.sig,
    });
  } catch {
    return false; // malformed signature
  }
}

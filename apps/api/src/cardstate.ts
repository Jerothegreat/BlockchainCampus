import { bytesToHex, hexToBytes, recoverTypedDataAddress, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { config } from "./config.js";
import { domain } from "./receipt.js";

/**
 * The wallet state stored ON THE CARD (one NDEF record, binary, big-endian).
 *
 *   STATE   (82 bytes, signed by the backend card signer)
 *     0      u8   version = 1
 *     1..9   u64  balance (centavos)
 *     9..13  u32  nonce (+1 every time the backend issues a new state)
 *     13..17 u32  issuedAt (unix seconds)
 *     17..82      signature (65 bytes) over EIP-712 CardState{cardId, balance, nonce, issuedAt}
 *   PENDING flag (1 byte): 0 = clear, 1 = a payment follows (written by a POS)
 *   PENDING (117 bytes, signed by the POS device as an EIP-712 Receipt with cardNonce = STATE.nonce)
 *     0..16   uuid bytes (receipt id)
 *     16..36  stall address
 *     36..44  u64 amount (centavos)
 *     44..52  u64 createdAt (unix ms)
 *     52..117 POS signature (65 bytes)
 *
 * Total 83 bytes clear / 200 bytes pending, so it needs NTAG215-class storage (≥ 504 bytes).
 * cardId (= uidHash) is not stored: it is derived from the UID, which binds the state to this card.
 */
export const CARD_FORMAT_VERSION = 1;
const STATE_LEN = 82;
const PENDING_LEN = 117;

export const cardStateTypes = {
  CardState: [
    { name: "cardId", type: "bytes32" },
    { name: "balance", type: "uint64" },
    { name: "nonce", type: "uint32" },
    { name: "issuedAt", type: "uint32" },
  ],
} as const;

const signer = privateKeyToAccount(config.cardSignerKey);
export const cardSignerAddress: Address = signer.address;

export type CardState = { balance: number; nonce: number; issuedAt: number; sig: Hex };
export type CardPending = { id: string; to: Address; amount: number; createdAt: number; sig: Hex };
export type CardRecord = { state: CardState; pending: CardPending | null };

const uuidToBytes = (uuid: string) => hexToBytes(`0x${uuid.replace(/-/g, "")}`);
const bytesToUuid = (b: Uint8Array) => {
  const h = bytesToHex(b).slice(2);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
};

export function encodeCard(record: CardRecord): Hex {
  const out = new Uint8Array(STATE_LEN + 1 + (record.pending ? PENDING_LEN : 0));
  const v = new DataView(out.buffer);
  v.setUint8(0, CARD_FORMAT_VERSION);
  v.setBigUint64(1, BigInt(record.state.balance));
  v.setUint32(9, record.state.nonce);
  v.setUint32(13, record.state.issuedAt);
  out.set(hexToBytes(record.state.sig), 17);
  v.setUint8(STATE_LEN, record.pending ? 1 : 0);
  if (record.pending) {
    const p = record.pending;
    const o = STATE_LEN + 1;
    out.set(uuidToBytes(p.id), o);
    out.set(hexToBytes(p.to), o + 16);
    v.setBigUint64(o + 36, BigInt(p.amount));
    v.setBigUint64(o + 44, BigInt(p.createdAt));
    out.set(hexToBytes(p.sig), o + 52);
  }
  return bytesToHex(out);
}

/** Parses the bytes read from the card. Returns null for anything malformed. */
export function decodeCard(hex: string): CardRecord | null {
  if (!/^0x[0-9a-fA-F]*$/.test(hex)) return null;
  const b = hexToBytes(hex as Hex);
  if (b.length !== STATE_LEN + 1 && b.length !== STATE_LEN + 1 + PENDING_LEN) return null;
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  if (v.getUint8(0) !== CARD_FORMAT_VERSION) return null;
  const state: CardState = {
    balance: Number(v.getBigUint64(1)),
    nonce: v.getUint32(9),
    issuedAt: v.getUint32(13),
    sig: bytesToHex(b.slice(17, STATE_LEN)),
  };
  const flag = v.getUint8(STATE_LEN);
  if (flag === 0) return b.length === STATE_LEN + 1 ? { state, pending: null } : null;
  if (flag !== 1 || b.length !== STATE_LEN + 1 + PENDING_LEN) return null;
  const o = STATE_LEN + 1;
  return {
    state,
    pending: {
      id: bytesToUuid(b.slice(o, o + 16)),
      to: bytesToHex(b.slice(o + 16, o + 36)) as Address,
      amount: Number(v.getBigUint64(o + 36)),
      createdAt: Number(v.getBigUint64(o + 44)),
      sig: bytesToHex(b.slice(o + 52, o + PENDING_LEN)),
    },
  };
}

const message = (cardId: Hex, s: Omit<CardState, "sig">) => ({
  cardId,
  balance: BigInt(s.balance),
  nonce: s.nonce,
  issuedAt: s.issuedAt,
});

/** Issues a fresh, clear card state (to be written to the card by the phone that tapped it). */
export async function issueCardState(cardId: Hex, balance: number, nonce: number): Promise<Hex> {
  const unsigned = { balance, nonce, issuedAt: Math.floor(Date.now() / 1000) };
  const sig = await signer.signTypedData({ domain, types: cardStateTypes, primaryType: "CardState", message: message(cardId, unsigned) });
  return encodeCard({ state: { ...unsigned, sig }, pending: null });
}

export async function verifyCardState(cardId: Hex, state: CardState): Promise<boolean> {
  try {
    const signerOf = await recoverTypedDataAddress({
      domain,
      types: cardStateTypes,
      primaryType: "CardState",
      message: message(cardId, state),
      signature: state.sig,
    });
    return signerOf === cardSignerAddress;
  } catch {
    return false;
  }
}

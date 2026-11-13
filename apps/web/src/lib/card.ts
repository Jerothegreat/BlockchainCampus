// The wallet record stored ON the NFC card. Byte layout and signatures mirror apps/api/src/cardstate.ts.
//   STATE  (82)  0 u8 version=1 | 1 u64 balance | 9 u32 nonce | 13 u32 issuedAt(s) | 17 sig[65]
//   FLAG   (1)   0 = clear, 1 = pending follows
//   PENDING(117) 0 uuid[16] | 16 stall address[20] | 36 u64 amount | 44 u64 createdAt(ms) | 52 POS sig[65]
import { bytesToHex, hexToBytes, recoverTypedDataAddress, type Address, type Hex } from 'viem'

export const CARD_MIME = 'application/x-umakpay'
const VERSION = 1
const STATE_LEN = 82
const PENDING_LEN = 117

export type CardState = { balance: number; nonce: number; issuedAt: number; sig: Hex }
export type CardPending = { id: string; to: Address; amount: number; createdAt: number; sig: Hex }
export type CardRecord = { state: CardState; pending: CardPending | null }

/** Chain values from /health that every EIP-712 signature is bound to. */
export type ChainInfo = { chainId: number; contract: Address; cardSigner: Address }

export const domainOf = (c: Pick<ChainInfo, 'chainId' | 'contract'>) =>
  ({ name: 'UMak Pay', version: '1', chainId: c.chainId, verifyingContract: c.contract }) as const

export const cardStateTypes = {
  CardState: [
    { name: 'cardId', type: 'bytes32' },
    { name: 'balance', type: 'uint64' },
    { name: 'nonce', type: 'uint32' },
    { name: 'issuedAt', type: 'uint32' },
  ],
} as const

export const receiptTypes = {
  Receipt: [
    { name: 'id', type: 'string' },
    { name: 'cardId', type: 'bytes32' },
    { name: 'to', type: 'address' },
    { name: 'amount', type: 'uint256' },
    { name: 'createdAt', type: 'uint64' },
    { name: 'cardNonce', type: 'uint32' },
  ],
} as const

/** cardId = 0x + sha256(normalized uid) = 0x + uidHash. */
export const cardIdOf = (uidHash: string) => `0x${uidHash}` as Hex

const uuidToBytes = (uuid: string) => hexToBytes(`0x${uuid.replace(/-/g, '')}`)
const bytesToUuid = (b: Uint8Array) => {
  const h = bytesToHex(b).slice(2)
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

export function encodeCard(record: CardRecord): Hex {
  const out = new Uint8Array(STATE_LEN + 1 + (record.pending ? PENDING_LEN : 0))
  const v = new DataView(out.buffer)
  v.setUint8(0, VERSION)
  v.setBigUint64(1, BigInt(record.state.balance))
  v.setUint32(9, record.state.nonce)
  v.setUint32(13, record.state.issuedAt)
  out.set(hexToBytes(record.state.sig), 17)
  v.setUint8(STATE_LEN, record.pending ? 1 : 0)
  if (record.pending) {
    const p = record.pending
    const o = STATE_LEN + 1
    out.set(uuidToBytes(p.id), o)
    out.set(hexToBytes(p.to), o + 16)
    v.setBigUint64(o + 36, BigInt(p.amount))
    v.setBigUint64(o + 44, BigInt(p.createdAt))
    out.set(hexToBytes(p.sig), o + 52)
  }
  return bytesToHex(out)
}

/** Parses the bytes read from the card. Returns null for anything malformed. */
export function decodeCard(hex: string): CardRecord | null {
  if (!/^0x[0-9a-fA-F]*$/.test(hex)) return null
  const b = hexToBytes(hex as Hex)
  if (b.length !== STATE_LEN + 1 && b.length !== STATE_LEN + 1 + PENDING_LEN) return null
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength)
  if (v.getUint8(0) !== VERSION) return null
  const state: CardState = {
    balance: Number(v.getBigUint64(1)),
    nonce: v.getUint32(9),
    issuedAt: v.getUint32(13),
    sig: bytesToHex(b.slice(17, STATE_LEN)),
  }
  const flag = v.getUint8(STATE_LEN)
  if (flag === 0) return b.length === STATE_LEN + 1 ? { state, pending: null } : null
  if (flag !== 1 || b.length !== STATE_LEN + 1 + PENDING_LEN) return null
  const o = STATE_LEN + 1
  return {
    state,
    pending: {
      id: bytesToUuid(b.slice(o, o + 16)),
      to: bytesToHex(b.slice(o + 16, o + 36)) as Address,
      amount: Number(v.getBigUint64(o + 36)),
      createdAt: Number(v.getBigUint64(o + 44)),
      sig: bytesToHex(b.slice(o + 52, o + PENDING_LEN)),
    },
  }
}

/** True when the STATE was signed by the backend's card signer for this card (offline check on the POS). */
export async function verifyCardState(chain: ChainInfo, cardId: Hex, s: CardState): Promise<boolean> {
  try {
    const signer = await recoverTypedDataAddress({
      domain: domainOf(chain),
      types: cardStateTypes,
      primaryType: 'CardState',
      message: { cardId, balance: BigInt(s.balance), nonce: s.nonce, issuedAt: s.issuedAt },
      signature: s.sig,
    })
    return signer.toLowerCase() === chain.cardSigner.toLowerCase()
  } catch {
    return false
  }
}

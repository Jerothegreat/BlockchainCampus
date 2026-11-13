// Typed client for apps/api. The contract is apps/api/API.md (card wallets); keep both in sync.
import type { Address, Hex } from 'viem'
import { deviceHeaders } from './device'

/** Card record bytes as hex, exactly as read from / written to the NFC card. */
export type CardHex = Hex

export type Health = { status: string; chainId: number; contract: Address; relayer: Address; deployer: Address; cardSigner: Address }
export type Merchant = { id: string; name: string; address: Address; deviceAddress: Address | null }
export type Student = { uidHash: string; studentNo: string; name: string; address: Address; balance: number; offlineCap: number }
export type SyncStudent = {
  uidHash: string
  studentNo: string
  name: string
  address: Address
  pinHash: string
  pinSalt: string | null // null = legacy sha256(pin + uid)
  pinIter: number | null
  balance: number
  offlineCap: number
  cardNonce: number
  blocked: boolean
}
export type Sync = { syncedAt: number; cardSigner: Address; students: SyncStudent[]; merchants: Merchant[] }

/** What /settle and /receipts return per receipt. `rejected` = refused by the API (bad signature, double spend...). */
export type ReceiptResult = { id: string; status: 'pending' | 'settled' | 'failed' | 'rejected'; reason?: string | null; txHash?: string | null; explorer?: string }
/** A POS-signed card payment (POST /settle). */
export type SignedReceipt = { id: string; cardId: Hex; to: Address; amount: number; createdAt: number; cardNonce: number; sig: Hex }

/** `linkTx` is null when the card was already linked on-chain and the server recovered that wallet. */
export type Linked = { uidHash: string; studentNo: string; address: Address; linkTx: Hex | null; card: CardHex }
export type CardUpdate = { card: CardHex; balance: number; nonce: number }
export type TopUp = CardUpdate & { txHash: Hex; explorer?: string; ref: string }
export type Refresh = CardUpdate & { settled: ReceiptResult[] }
export type HistoryItem = {
  id: string
  to: Address
  merchant: string | null
  amount: number
  status: ReceiptResult['status']
  reason: string | null
  txHash: string | null
  explorer?: string
  createdAt: number
}
export type History = { address: Address; studentNo: string; name: string; balance: number | null; pendingTotal: number; receipts: HistoryItem[] }
export type Sale = { id: string; amount: number; status: ReceiptResult['status']; reason: string | null; txHash: string | null; explorer?: string; createdAt: number }
export type Withdrawal = { id: string; amount: number; ref: string; status: string; txHash: string | null; explorer?: string }
export type StallMe = Merchant & { balance: number | null; sales: Sale[]; withdrawals: Withdrawal[] }

// Default: the API on port 3000 of whatever host served the PWA (laptop over USB/LAN in the demo).
const apiUrl = (): string => import.meta.env.VITE_API_URL ?? `${location.protocol}//${location.hostname}:3000`

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

type Init = { method?: string; json?: unknown; headers?: Record<string, string> }

async function call<T>(path: string, init: Init = {}): Promise<T> {
  let res: Response
  try {
    res = await fetch(apiUrl() + path, {
      method: init.method ?? (init.json === undefined ? 'GET' : 'POST'),
      headers: { ...(init.json === undefined ? {} : { 'Content-Type': 'application/json' }), ...init.headers },
      body: init.json === undefined ? undefined : JSON.stringify(init.json),
    })
  } catch {
    throw new ApiError(0, 'OFFLINE')
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new ApiError(res.status, body.error ?? res.statusText)
  }
  return res.json() as Promise<T>
}

const cashier = (key: string) => ({ 'x-cashier-key': key })

export const api = {
  health: () => call<Health>('/health'),

  // Students and cards. Every call returning `card` must be written to the card before showing success.
  register: (b: { email: string; uid: string; studentNo: string; name?: string; pin: string }) => call<Linked>('/cards/register', { json: b }),
  link: (key: string, b: { uid: string; studentNo: string; name?: string; pin: string }) => call<Linked>('/link', { json: b, headers: cashier(key) }),
  topUp: (b: { uid: string; card: CardHex; amount: number }) => call<TopUp>('/cards/topup', { json: b }),
  topUpCash: (key: string, b: { uid: string; card: CardHex; amount: number; orNumber: string }) =>
    call<TopUp>('/cards/topup/cash', { json: b, headers: cashier(key) }),
  refresh: (b: { uid: string; card: CardHex }) => call<Refresh>('/cards/refresh', { json: b }),
  byUid: (uidHash: string) => call<Student>(`/students/by-uid/${uidHash}`),
  history: (address: Address, limit = 50) => call<History>(`/students/${address}/receipts?limit=${limit}`),

  // Stalls
  merchants: () => call<Merchant[]>('/merchants'),
  registerStall: (b: { name: string; deviceAddress: Address }) => call<Merchant>('/merchants', { json: b }),
  moveStallDevice: (key: string, id: string, deviceAddress: Address) =>
    call<{ ok: true }>(`/merchants/${id}/device`, { json: { deviceAddress }, headers: cashier(key) }),
  stallMe: async () => call<StallMe>('/merchants/me', { headers: await deviceHeaders() }),
  withdraw: async (b: { id: string; amount: number }) =>
    call<Withdrawal>('/merchants/withdraw', { json: b, headers: await deviceHeaders() }),

  // POS
  sync: async () => call<Sync>('/sync', { headers: await deviceHeaders() }),
  settle: (receipts: SignedReceipt[]) => call<{ results: ReceiptResult[] }>('/settle', { json: { receipts } }),
  receipt: (id: string) => call<ReceiptResult>(`/receipts/${id}`),
}

/** Plain-language text for the API's error codes (API.md "Card endpoint errors"). */
export function errorText(e: unknown): string {
  const code = e instanceof ApiError ? e.message : e instanceof Error ? e.message : String(e)
  const map: Record<string, string> = {
    OFFLINE: 'No connection to the server. Check the signal and try again.',
    CARD_NOT_LINKED: 'This ID is not registered yet.',
    CARD_PENDING: 'This ID has a payment waiting to settle. Tap it on a phone with signal first.',
    CARD_STALE: 'This ID holds an old copy of its balance. Refresh the card first.',
    CARD_BLOCKED: 'This ID is blocked: a copied or rolled-back card was detected. See the cashier.',
    INVALID_CARD_RECORD: 'The wallet record on this ID could not be read.',
    FORGED_CARD_RECORD: 'The wallet record on this ID is not genuine.',
    CHAIN_UNAVAILABLE: 'The blockchain did not answer. Nothing changed; try again.',
    ALREADY_LINKED: 'This ID or student number is already registered.',
    EMAIL_ALREADY_REGISTERED: 'This email already has a registered ID.',
    UMAK_EMAIL_REQUIRED: 'Use your @umak.edu.ph email.',
    RATE_LIMITED: 'Too many tries. Wait a few minutes.',
    UNAUTHORIZED: 'Wrong cashier key.',
    CASHIER_KEY_NOT_CONFIGURED: 'The server has no CASHIER_KEY set.',
    INSUFFICIENT: 'Not enough balance.',
    DEVICE_IN_USE: 'This phone is already registered to a stall.',
    DEVICE_NOT_REGISTERED: 'This phone is not registered as a stall.',
    DEVICE_CLOCK_SKEW: "This phone's clock is off. Set the time automatically.",
  }
  return map[code] ?? code
}

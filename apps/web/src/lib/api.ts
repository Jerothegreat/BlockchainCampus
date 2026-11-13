// Typed client for apps/api. The contract is docs/api-contract.md; keep both in sync.
export type Address = `0x${string}`
export type Student = { uidHash: string; studentNo: string; name: string; address: Address; balance: number }
export type SyncStudent = Student & { pinHash: string; offlineCap: number; capReason: string; flagged: boolean }
export type Merchant = { id: string; name: string; address: Address }
export type Receipt = {
  id: string
  from: Address
  to: Address
  amount: number
  createdAt: number
  uidHash: string
  merchantId: string
  item?: string
}
export type ReceiptStatus = Receipt & {
  status: 'pending' | 'settled' | 'failed'
  txHash: string | null
  blockNumber: number | null
  merchantName: string
  studentName: string
  failReason: string | null
}
export type Ops = {
  flags: { uidHash: string; studentName: string; reason: string; at: number; capBefore: number; capAfter: number }[]
  stalls: { merchantId: string; name: string; online: boolean; queue: number; lastSync: number | null }[]
  totals: { settled: number; pending: number; failed: number; count: number }
  receipts: ReceiptStatus[]
  caps: { studentName: string; uidHash: string; offlineCap: number; capReason: string }[]
}

// Default: the API on port 3000 of whatever host served the PWA (laptop over USB/LAN in the demo).
const apiUrl = (): string => import.meta.env.VITE_API_URL ?? `${location.protocol}//${location.hostname}:3000`
export const EXPLORER_URL: string = import.meta.env.VITE_EXPLORER_URL ?? 'https://amoy.polygonscan.com'
export const txUrl = (hash: string) => `${EXPLORER_URL}/tx/${hash}`

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function call<T>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const res = await fetch(apiUrl() + path, {
    ...init,
    method: init?.method ?? (init?.json === undefined ? 'GET' : 'POST'),
    headers: init?.json === undefined ? init?.headers : { 'Content-Type': 'application/json', ...init?.headers },
    body: init?.json === undefined ? init?.body : JSON.stringify(init.json),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new ApiError(res.status, body.error ?? res.statusText)
  }
  return res.json() as Promise<T>
}

export const api = {
  link: (b: { uid: string; studentNo: string; name: string; pin: string }) => call<Student>('/link', { json: b }),
  byUid: (uidHash: string) => call<Student>(`/students/by-uid/${uidHash}`),
  byNo: (studentNo: string) => call<Student>(`/students/by-no/${encodeURIComponent(studentNo)}`),
  login: (b: { studentNo: string; pin: string }) => call<Student>('/login', { json: b }),
  studentReceipts: (studentNo: string) => call<ReceiptStatus[]>(`/students/${encodeURIComponent(studentNo)}/receipts`),
  sync: (merchantId?: string, queue?: number) =>
    call<{ syncedAt: number; merchants: Merchant[]; students: SyncStudent[] }>(
      `/sync${merchantId ? `?merchantId=${encodeURIComponent(merchantId)}&queue=${queue ?? 0}` : ''}`,
    ),
  settle: (receipts: Receipt[]) => call<{ txHash: string | null; receipts: ReceiptStatus[] }>('/settle', { json: { receipts } }),
  receipt: (id: string) => call<ReceiptStatus>(`/receipts/${id}`),
  settlements: (limit = 10) => call<ReceiptStatus[]>(`/settlements?limit=${limit}`),
  ops: () => call<Ops>('/ops'),
  assistant: (b: { studentNo: string; question: string }) => call<{ answer: string; tip: string }>('/assistant', { json: b }),
}

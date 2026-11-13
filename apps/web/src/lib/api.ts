// Phone reaches the laptop API through `adb reverse tcp:3000 tcp:3000`, so localhost works there too.
export const API_URL: string = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'

export class ApiError extends Error {
  readonly status: number
  readonly code: string
  constructor(status: number, code: string) {
    super(code)
    this.status = status
    this.code = code
  }
}

export type Student = {
  uidHash: string
  studentNo: string
  name: string
  address: string
  balance: number // centavos
  offlineCap: number // centavos
}
export type Merchant = { id: string; name: string; address: string }
export type TopUpResult = { txHash: string; explorer?: string }

async function request<T>(path: string, init: RequestInit & { cashierKey?: string } = {}): Promise<T> {
  const { cashierKey, ...rest } = init
  let res: Response
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...rest,
      headers: {
        ...(rest.body ? { 'content-type': 'application/json' } : {}),
        ...(cashierKey ? { 'x-cashier-key': cashierKey } : {}),
      },
    })
  } catch {
    throw new ApiError(0, 'NETWORK')
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError(res.status, (data as { error?: string }).error ?? 'UNKNOWN')
  return data as T
}

export const api = {
  studentByUid: (uidHash: string) => request<Student>(`/students/by-uid/${uidHash}`),
  link: (cashierKey: string, body: { uid: string; studentNo: string; name?: string; pin: string }) =>
    request<{ uidHash: string; address: string }>('/link', { method: 'POST', body: JSON.stringify(body), cashierKey }),
  topUp: (cashierKey: string, uidHash: string, amount: number, orNumber: string) =>
    request<TopUpResult>('/topup', { method: 'POST', body: JSON.stringify({ uidHash, amount, orNumber }), cashierKey }),
  merchants: () => request<Merchant[]>('/merchants'),
  addMerchant: (cashierKey: string, name: string) =>
    request<Merchant>('/merchants', { method: 'POST', body: JSON.stringify({ name }), cashierKey }),
}

const messages: Record<string, string> = {
  NETWORK: "Can't reach the server. Check the connection (and `adb reverse tcp:3000 tcp:3000`).",
  UNAUTHORIZED: 'Wrong cashier key.',
  CASHIER_KEY_NOT_CONFIGURED: 'Server has no CASHIER_KEY set.',
  ALREADY_LINKED: 'This ID or student number is already linked.',
  CHAIN_UNAVAILABLE: 'Blockchain network unavailable. Try again in a moment.',
  TOPUP_NOT_CONFIGURED: 'Server has no DEPLOYER_PRIVATE_KEY set.',
  STUDENT_NOT_FOUND: 'This ID is not linked yet.',
}

export const errorMessage = (e: unknown) =>
  e instanceof ApiError ? (messages[e.code] ?? `Request failed (${e.code}).`) : 'Something went wrong.'

// Offline acceptance rules for the stall POS (PRD "Merchant POS", PRODUCT.md constraints).
// All amounts are centavos.

export type CheckResult =
  | { ok: true }
  | { ok: false; reason: 'flagged' }
  | { ok: false; reason: 'over-cap'; limit: number }
  | { ok: false; reason: 'insufficient'; available: number }
  | { ok: false; reason: 'invalid' }

export function checkPayment({
  amount,
  student,
  pending,
}: {
  amount: number
  student: { balance: number; offlineCap: number }
  pending: number
}): CheckResult {
  if (!Number.isInteger(amount) || amount <= 0) return { ok: false, reason: 'invalid' }
  if (student.offlineCap <= 0) return { ok: false, reason: 'flagged' }
  if (amount > student.offlineCap) return { ok: false, reason: 'over-cap', limit: student.offlineCap }
  const available = student.balance - pending
  if (amount > available) return { ok: false, reason: 'insufficient', available: Math.max(0, available) }
  return { ok: true }
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** sha256(pin + uid), uid normalized (lib/uid.ts). Must match the API's /link. */
export const pinHash = (pin: string, uid: string) => sha256Hex(pin + uid)

const fmt = new Intl.NumberFormat('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
export const pesos = (centavos: number) => '₱' + fmt.format(centavos / 100)

/** Wrong-PIN lock (placeholder rule, owner to confirm): 3 tries, then 5 minutes. */
export const PIN_TRIES = 3
export const PIN_LOCK_MS = 5 * 60_000

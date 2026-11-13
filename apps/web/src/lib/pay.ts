// Offline acceptance rules for the stall POS (API.md "POS: offline payment"). All amounts are centavos.
import type { SyncStudent } from './api'
import type { CardRecord } from './card'

export type CheckResult =
  | { ok: true }
  | { ok: false; reason: 'invalid' | 'blocked' | 'pending' | 'stale' }
  | { ok: false; reason: 'over-cap'; limit: number }
  | { ok: false; reason: 'insufficient'; available: number }

/**
 * The /sync snapshot sends offlineCap = min(cap, balance at sync time). When it equals that balance the
 * real cap is at least the balance, so a top-up after the sync must not be blocked by it.
 */
export const capOf = (s: Pick<SyncStudent, 'offlineCap' | 'balance'>) => (s.offlineCap < s.balance ? s.offlineCap : Infinity)

/** Card checks that need no PIN: refuse before asking for it. */
export function checkCard({ record, student, queuedOnThisNonce }: { record: CardRecord; student: SyncStudent; queuedOnThisNonce: boolean }): CheckResult {
  if (student.blocked) return { ok: false, reason: 'blocked' }
  if (record.pending || queuedOnThisNonce) return { ok: false, reason: 'pending' }
  if (record.state.nonce < student.cardNonce) return { ok: false, reason: 'stale' }
  return { ok: true }
}

export function checkAmount({ amount, record, student }: { amount: number; record: CardRecord; student: SyncStudent }): CheckResult {
  if (!Number.isInteger(amount) || amount <= 0) return { ok: false, reason: 'invalid' }
  const limit = capOf(student)
  if (limit <= 0) return { ok: false, reason: 'blocked' }
  if (amount > limit) return { ok: false, reason: 'over-cap', limit }
  if (amount > record.state.balance) return { ok: false, reason: 'insufficient', available: record.state.balance }
  return { ok: true }
}

const fmt = new Intl.NumberFormat('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
export const pesos = (centavos: number) => '₱' + fmt.format(centavos / 100)

/** Every PIN is exactly 6 digits (API: ^[0-9]{6}$). */
export const PIN_LENGTH = 6
export const isPin = (pin: string) => /^\d{6}$/.test(pin)

/** Wrong-PIN lock (placeholder rule, owner to confirm): 3 tries, then 5 minutes. */
export const PIN_TRIES = 3
export const PIN_LOCK_MS = 5 * 60_000

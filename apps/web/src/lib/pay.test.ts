import { describe, expect, it } from 'vitest'
import type { SyncStudent } from './api'
import type { CardRecord } from './card'
import { capOf, checkAmount, checkCard, pesos } from './pay'

const student = (o: Partial<SyncStudent> = {}): SyncStudent => ({
  uidHash: 'u', studentNo: 'K1', name: 'Ana Reyes', address: '0x1111111111111111111111111111111111111111',
  pinHash: '', pinSalt: null, pinIter: null, balance: 50000, offlineCap: 10000, cardNonce: 3, blocked: false, ...o,
})
const record = (balance = 50000, nonce = 3, pending = false): CardRecord => ({
  state: { balance, nonce, issuedAt: 1, sig: '0x' },
  pending: pending ? { id: 'x', to: '0x2222222222222222222222222222222222222222', amount: 1, createdAt: 1, sig: '0x' } : null,
})

describe('checkCard (API.md POS step 3)', () => {
  it('accepts a clear, current card', () => expect(checkCard({ record: record(), student: student(), queuedOnThisNonce: false })).toEqual({ ok: true }))
  it('refuses a card with a pending payment', () =>
    expect(checkCard({ record: record(50000, 3, true), student: student(), queuedOnThisNonce: false })).toEqual({ ok: false, reason: 'pending' }))
  it('refuses when this POS already queued a payment on the same nonce (write was lost)', () =>
    expect(checkCard({ record: record(), student: student(), queuedOnThisNonce: true })).toEqual({ ok: false, reason: 'pending' }))
  it('refuses a stale copy (nonce below the synced one)', () =>
    expect(checkCard({ record: record(50000, 2), student: student(), queuedOnThisNonce: false })).toEqual({ ok: false, reason: 'stale' }))
  it('refuses a blocked card first', () =>
    expect(checkCard({ record: record(50000, 2, true), student: student({ blocked: true }), queuedOnThisNonce: false })).toEqual({ ok: false, reason: 'blocked' }))
})

describe('checkAmount', () => {
  it('accepts up to the offline cap', () => expect(checkAmount({ amount: 10000, record: record(), student: student() })).toEqual({ ok: true }))
  it('rejects one centavo over the cap', () =>
    expect(checkAmount({ amount: 10001, record: record(), student: student() })).toEqual({ ok: false, reason: 'over-cap', limit: 10000 }))
  it('uses the balance on the card', () =>
    expect(checkAmount({ amount: 9000, record: record(8500), student: student() })).toEqual({ ok: false, reason: 'insufficient', available: 8500 }))
  it('a cap equal to the synced balance is not a cap (top-up after sync)', () => {
    const s = student({ balance: 0, offlineCap: 0 })
    expect(capOf(s)).toBe(Infinity)
    expect(checkAmount({ amount: 8500, record: record(20000), student: s })).toEqual({ ok: true })
  })
  it('rejects zero and fractions', () => {
    expect(checkAmount({ amount: 0, record: record(), student: student() })).toEqual({ ok: false, reason: 'invalid' })
    expect(checkAmount({ amount: 1.5, record: record(), student: student() })).toEqual({ ok: false, reason: 'invalid' })
  })
})

describe('pesos', () => {
  it('formats centavos', () => expect(pesos(8500)).toBe('₱85.00'))
})

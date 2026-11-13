import { describe, expect, it } from 'vitest'
import { checkPayment, pinHash, pesos } from './pay'

const student = { balance: 50000, offlineCap: 20000 }

describe('checkPayment (PRD: amount <= balance - pending and amount <= offlineCap)', () => {
  it('accepts an amount within both limits', () => {
    expect(checkPayment({ amount: 8500, student, pending: 0 })).toEqual({ ok: true })
  })

  it('accepts exactly the offline cap', () => {
    expect(checkPayment({ amount: 20000, student, pending: 0 })).toEqual({ ok: true })
  })

  it('rejects one centavo over the offline cap', () => {
    expect(checkPayment({ amount: 20001, student, pending: 0 })).toEqual({ ok: false, reason: 'over-cap', limit: 20000 })
  })

  it('subtracts pending payments from the balance', () => {
    const s = { balance: 10000, offlineCap: 20000 }
    expect(checkPayment({ amount: 3000, student: s, pending: 7000 })).toEqual({ ok: true })
    expect(checkPayment({ amount: 3001, student: s, pending: 7000 })).toEqual({ ok: false, reason: 'insufficient', available: 3000 })
  })

  it('treats a cap of 0 as a flagged ID, before any other check', () => {
    const s = { balance: 0, offlineCap: 0 }
    expect(checkPayment({ amount: 100, student: s, pending: 0 })).toEqual({ ok: false, reason: 'flagged' })
  })

  it('rejects zero and negative amounts', () => {
    expect(checkPayment({ amount: 0, student, pending: 0 }).ok).toBe(false)
  })
})

describe('pinHash', () => {
  it('is sha256(pin + uid) in hex, matching the API', async () => {
    // sha256("1234" + "04a21b7c") computed with node:crypto
    const { createHash } = await import('node:crypto')
    const expected = createHash('sha256').update('123404a21b7c').digest('hex')
    expect(await pinHash('1234', '04a21b7c')).toBe(expected)
  })
})

describe('pesos', () => {
  it('formats centavos as pesos', () => {
    expect(pesos(8500)).toBe('₱85.00')
    expect(pesos(124000)).toBe('₱1,240.00')
  })
})

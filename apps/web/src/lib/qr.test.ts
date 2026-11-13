import { describe, expect, it } from 'vitest'
import { decodeReceipt, encodeReceipt, type QrReceipt } from './qr'

const r: QrReceipt = {
  id: '7c1e9a40-55b2-4d1f-9c3a-0e5b2a1d4f60',
  from: `0x7Ae3${'0'.repeat(32)}c219`,
  to: `0x51D0${'0'.repeat(32)}3b8e`,
  amount: 8500,
  createdAt: 1794544860000,
  uidHash: 'a'.repeat(64),
  merchantId: 'm1',
  merchantName: "Kuya's Grill",
  studentName: 'Juan D.',
  item: 'Rice meal',
}

describe('receipt QR payload', () => {
  it('round-trips', () => {
    expect(decodeReceipt(encodeReceipt(r))).toEqual(r)
  })

  it('round-trips without an item', () => {
    const { item: _, ...noItem } = r
    expect(decodeReceipt(encodeReceipt(noItem))).toEqual(noItem)
  })

  it('cannot be broken by a | in a name', () => {
    expect(decodeReceipt(encodeReceipt({ ...r, merchantName: 'A|B' }))?.merchantName).toBe('A B')
  })

  it('rejects other QR codes', () => {
    expect(decodeReceipt('https://example.com')).toBeNull()
    expect(decodeReceipt(encodeReceipt(r).replace(r.from, '0xnope'))).toBeNull()
  })

  it('fits a version 10 QR at level L (under 271 bytes)', () => {
    expect(new TextEncoder().encode(encodeReceipt(r)).length).toBeLessThan(271)
  })
})

// Receipt QR payload, POS -> student phone, offline. Compact so the QR stays scannable at 192 px.
// Format: HP1|id|from|to|amount|createdAt|uidHash|merchantId|merchantName|studentName|item
import type { Receipt } from './api'

export type QrReceipt = Receipt & { merchantName: string; studentName: string }

const PREFIX = 'HP1'
const clean = (s: string) => s.replaceAll('|', ' ')

export function encodeReceipt(r: QrReceipt): string {
  return [PREFIX, r.id, r.from, r.to, r.amount, r.createdAt, r.uidHash, r.merchantId, clean(r.merchantName), clean(r.studentName), clean(r.item ?? '')].join('|')
}

/** Returns null for anything that is not a HeronPay receipt QR. */
export function decodeReceipt(text: string): QrReceipt | null {
  const p = text.split('|')
  if (p.length !== 11 || p[0] !== PREFIX) return null
  const [, id, from, to, amount, createdAt, uidHash, merchantId, merchantName, studentName, item] = p
  const addr = /^0x[0-9a-fA-F]{40}$/
  if (!addr.test(from) || !addr.test(to) || !/^\d+$/.test(amount) || !/^\d+$/.test(createdAt) || !id) return null
  return {
    id,
    from: from as `0x${string}`,
    to: to as `0x${string}`,
    amount: Number(amount),
    createdAt: Number(createdAt),
    uidHash,
    merchantId,
    merchantName,
    studentName,
    ...(item ? { item } : {}),
  }
}

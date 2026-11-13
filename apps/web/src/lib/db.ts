// IndexedDB (dexie). Stall phone: the /sync cache, the signed receipt queue and PIN locks.
// Every phone: virtual demo cards (no NFC hardware) and small settings in `meta`.
import Dexie, { type EntityTable } from 'dexie'
import type { Merchant, ReceiptResult, SignedReceipt, SyncStudent } from './api'

export type QueuedReceipt = SignedReceipt & {
  uidHash: string
  studentName: string
  merchantName: string
  item?: string
  status: ReceiptResult['status']
  reason: string | null
  txHash: string | null
  explorer: string | null
}
export type PinLock = { uidHash: string; tries: number; until: number }
/** A card that lives in this browser instead of on an NFC chip (laptop demo, no NFC). */
export type VirtualCard = { uid: string; card: `0x${string}` | null; label: string }
export type Meta = { key: string; value: unknown }

// New name: the record shapes changed with card wallets, so nothing from the old 'heronpay' DB carries over.
export const db = new Dexie('umakpay') as Dexie & {
  students: EntityTable<SyncStudent, 'uidHash'>
  merchants: EntityTable<Merchant, 'id'>
  posQueue: EntityTable<QueuedReceipt, 'id'>
  locks: EntityTable<PinLock, 'uidHash'>
  virtualCards: EntityTable<VirtualCard, 'uid'>
  meta: EntityTable<Meta, 'key'>
}

db.version(1).stores({
  students: 'uidHash, studentNo',
  merchants: 'id',
  posQueue: 'id, status, createdAt, uidHash',
  locks: 'uidHash',
  virtualCards: 'uid',
  meta: 'key',
})

export async function getMeta<T>(key: string): Promise<T | undefined> {
  return (await db.meta.get(key))?.value as T | undefined
}
export const setMeta = (key: string, value: unknown) => db.meta.put({ key, value })

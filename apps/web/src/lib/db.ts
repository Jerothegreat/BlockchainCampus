// IndexedDB (dexie). Stall phone: the /sync cache, the receipt queue and PIN locks.
// Student phone: scanned receipts and the login. Both roles can share one phone in the demo.
import Dexie, { type EntityTable } from 'dexie'
import type { Merchant, Receipt, ReceiptStatus, Student, SyncStudent } from './api'

export type QueuedReceipt = Receipt & {
  studentName: string
  merchantName: string
  status: ReceiptStatus['status']
  txHash: string | null
  blockNumber: number | null
  failReason: string | null
}
export type PinLock = { uidHash: string; tries: number; until: number }
export type Meta = { key: string; value: unknown }

export const db = new Dexie('heronpay') as Dexie & {
  students: EntityTable<SyncStudent, 'uidHash'>
  merchants: EntityTable<Merchant, 'id'>
  posQueue: EntityTable<QueuedReceipt, 'id'>
  meReceipts: EntityTable<QueuedReceipt, 'id'>
  locks: EntityTable<PinLock, 'uidHash'>
  meta: EntityTable<Meta, 'key'>
}

db.version(1).stores({
  students: 'uidHash, studentNo',
  merchants: 'id',
  posQueue: 'id, status, createdAt, uidHash',
  meReceipts: 'id, status, createdAt',
  locks: 'uidHash',
  meta: 'key',
})

export async function getMeta<T>(key: string): Promise<T | undefined> {
  return (await db.meta.get(key))?.value as T | undefined
}
export const setMeta = (key: string, value: unknown) => db.meta.put({ key, value })

export type MeLogin = Student

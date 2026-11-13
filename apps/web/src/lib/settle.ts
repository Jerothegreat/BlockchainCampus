import type { EntityTable } from 'dexie'
import { api, type Receipt } from './api'
import type { QueuedReceipt } from './db'

type Settle = typeof api.settle

const wire = ({ id, from, to, amount, createdAt, uidHash, merchantId, item }: QueuedReceipt): Receipt => ({
  id, from, to, amount, createdAt, uidHash, merchantId, ...(item ? { item } : {}),
})

/**
 * Sends every pending receipt in `table` to POST /settle and stores the result.
 * Either phone may call this; the API and the contract skip ids already settled.
 * Throws on a network or server error; the receipts stay pending.
 */
export async function pushQueue(table: EntityTable<QueuedReceipt, 'id'>, settle: Settle = api.settle) {
  const pending = await table.where('status').equals('pending').toArray()
  if (pending.length === 0) return { sent: 0, settled: 0, failed: 0 }
  const res = await settle(pending.map(wire))
  let settled = 0
  let failed = 0
  for (const s of res.receipts) {
    if (s.status === 'settled') settled++
    if (s.status === 'failed') failed++
    await table.update(s.id, { status: s.status, txHash: s.txHash, blockNumber: s.blockNumber, failReason: s.failReason })
  }
  return { sent: pending.length, settled, failed }
}

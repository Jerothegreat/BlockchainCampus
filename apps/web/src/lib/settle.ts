import type { EntityTable } from 'dexie'
import { api, type SignedReceipt } from './api'
import type { QueuedReceipt } from './db'

type Settle = typeof api.settle
const BATCH = 50 // API max per /settle call

const wire = ({ id, cardId, to, amount, createdAt, cardNonce, sig }: QueuedReceipt): SignedReceipt => ({ id, cardId, to, amount, createdAt, cardNonce, sig })

/**
 * Sends every pending receipt in `table` to POST /settle and stores each outcome.
 * Either phone may settle a payment first; the API and the contract skip ids already settled.
 * Throws on a network or server error; the receipts stay pending.
 */
export async function pushQueue(table: EntityTable<QueuedReceipt, 'id'>, settle: Settle = api.settle) {
  const pending = await table.where('status').equals('pending').toArray()
  let settled = 0
  let failed = 0
  for (let i = 0; i < pending.length; i += BATCH) {
    const res = await settle(pending.slice(i, i + BATCH).map(wire))
    for (const r of res.results) {
      if (r.status === 'settled') settled++
      if (r.status === 'failed' || r.status === 'rejected') failed++
      await table.update(r.id, { status: r.status, reason: r.reason ?? null, txHash: r.txHash ?? null, explorer: r.explorer ?? null })
    }
  }
  return { sent: pending.length, settled, failed }
}

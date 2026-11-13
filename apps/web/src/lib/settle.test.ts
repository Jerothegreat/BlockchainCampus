import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db, type QueuedReceipt } from './db'
import { pushQueue } from './settle'
import type { ReceiptStatus } from './api'

const r = (id: string, status: QueuedReceipt['status'] = 'pending'): QueuedReceipt => ({
  id,
  from: '0x1111111111111111111111111111111111111111',
  to: '0x2222222222222222222222222222222222222222',
  amount: 8500,
  createdAt: 1,
  uidHash: 'u1',
  merchantId: 'm1',
  studentName: 'Juan D.',
  merchantName: "Kuya's Grill",
  status,
  txHash: null,
  blockNumber: null,
  failReason: null,
})

beforeEach(async () => {
  await db.posQueue.clear()
})

describe('pushQueue', () => {
  it('sends only pending receipts and stores what the API returns', async () => {
    await db.posQueue.bulkPut([r('a'), r('b'), r('c', 'settled')])
    const settle = vi.fn(async (receipts: { id: string }[]) => ({
      txHash: '0xabc',
      receipts: receipts.map((x) => ({ ...r(x.id), status: x.id === 'a' ? 'settled' : 'failed', txHash: '0xabc', blockNumber: 7, failReason: x.id === 'b' ? 'INSUFFICIENT' : null }) as ReceiptStatus),
    }))

    const out = await pushQueue(db.posQueue, settle)

    expect(settle).toHaveBeenCalledTimes(1)
    expect(settle.mock.calls[0][0].map((x) => x.id).sort()).toEqual(['a', 'b'])
    // Only Receipt fields go over the wire, not local display fields.
    expect(Object.keys(settle.mock.calls[0][0][0]).sort()).toEqual(['amount', 'createdAt', 'from', 'id', 'merchantId', 'to', 'uidHash'])
    expect(out).toEqual({ sent: 2, settled: 1, failed: 1 })
    expect((await db.posQueue.get('a'))?.status).toBe('settled')
    expect((await db.posQueue.get('a'))?.blockNumber).toBe(7)
    expect((await db.posQueue.get('b'))?.failReason).toBe('INSUFFICIENT')
  })

  it('does nothing with an empty queue', async () => {
    const settle = vi.fn()
    expect(await pushQueue(db.posQueue, settle)).toEqual({ sent: 0, settled: 0, failed: 0 })
    expect(settle).not.toHaveBeenCalled()
  })

  it('keeps receipts pending when the network fails', async () => {
    await db.posQueue.put(r('a'))
    await expect(pushQueue(db.posQueue, async () => { throw new TypeError('Failed to fetch') })).rejects.toThrow()
    expect((await db.posQueue.get('a'))?.status).toBe('pending')
  })
})

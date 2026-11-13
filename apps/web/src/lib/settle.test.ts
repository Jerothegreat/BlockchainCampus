import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db, type QueuedReceipt } from './db'
import { pushQueue } from './settle'

const r = (id: string, status: QueuedReceipt['status'] = 'pending'): QueuedReceipt => ({
  id, cardId: `0x${'ab'.repeat(32)}`, to: '0x2222222222222222222222222222222222222222', amount: 8500, createdAt: 1, cardNonce: 2, sig: '0x01',
  uidHash: 'u1', studentName: 'Ana R.', merchantName: "Kuya's Grill", status, reason: null, txHash: null, explorer: null,
})

describe('pushQueue', () => {
  beforeEach(() => db.posQueue.clear())

  it('sends only pending receipts, without local fields, and stores each result', async () => {
    await db.posQueue.bulkPut([r('a'), r('b'), r('c', 'settled')])
    const settle = vi.fn(async () => ({ results: [
      { id: 'a', status: 'settled' as const, txHash: '0xt', explorer: 'https://x/tx/0xt' },
      { id: 'b', status: 'rejected' as const, reason: 'DOUBLE_SPEND' },
    ] }))
    expect(await pushQueue(db.posQueue, settle)).toEqual({ sent: 2, settled: 1, failed: 1 })
    const sent = (settle.mock.calls[0] as unknown as [unknown[]])[0]
    expect(sent).toHaveLength(2)
    expect(Object.keys(sent[0] as object).sort()).toEqual(['amount', 'cardId', 'cardNonce', 'createdAt', 'id', 'sig', 'to'])
    expect(await db.posQueue.get('a')).toMatchObject({ status: 'settled', txHash: '0xt' })
    expect(await db.posQueue.get('b')).toMatchObject({ status: 'rejected', reason: 'DOUBLE_SPEND' })
  })

  it('keeps receipts pending when the API is unreachable', async () => {
    await db.posQueue.put(r('a'))
    await expect(pushQueue(db.posQueue, async () => { throw new Error('offline') })).rejects.toThrow()
    expect((await db.posQueue.get('a'))?.status).toBe('pending')
  })
})

// Sample data so every screen works with no API (design review, parity gate, backup demo).
// Every place that shows it carries a Sample tag (design brief rule 11). PIN for the sample student: 1234.
import type { Merchant, SyncStudent } from './api'
import { db, setMeta } from './db'
import { pinHash } from './pay'
import { hashUid } from './uid'

export const SAMPLE_UID = '04a21b7c5e80'
export const SAMPLE_PIN = '1234'

/** A 40-hex-digit sample address, matching the shortened ones on the board (0x51D0…3b8e). */
const addr = (head: string, tail: string) => `0x${head}${'0'.repeat(32)}${tail}` as `0x${string}`

export const SAMPLE_MERCHANTS: Merchant[] = [
  { id: 'm1', name: "Kuya's Grill", address: addr('51D0', '3b8e') },
  { id: 'm2', name: "Ate Nena's Snacks", address: addr('62E1', '4c9f') },
]

export async function sampleStudent(): Promise<SyncStudent> {
  return {
    uidHash: await hashUid(SAMPLE_UID),
    studentNo: 'K12345678',
    name: 'Juan Dela Cruz',
    address: addr('7Ae3', 'c219'),
    balance: 50000,
    pinHash: await pinHash(SAMPLE_PIN, SAMPLE_UID),
    offlineCap: 20000,
    capReason: 'Default limit, no history yet',
    flagged: false,
  }
}

/** Fills the POS cache with sample data if it is empty. */
export async function seedSampleIfEmpty() {
  if ((await db.students.count()) > 0) return
  const student = await sampleStudent()
  await db.transaction('rw', db.students, db.merchants, db.meta, async () => {
    await db.students.put(student)
    await db.merchants.bulkPut(SAMPLE_MERCHANTS)
    await setMeta('syncedAt', Date.now())
    await setMeta('sample', true)
  })
}

// Student phone (/me) state: the login, the receipts on this phone, and settling them on `online`.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { ApiError, api, type Student } from '../lib/api'
import { db, getMeta, setMeta, type QueuedReceipt } from '../lib/db'
import { useLive, useOnline } from '../lib/hooks'
import { decodeReceipt } from '../lib/qr'
import { SAMPLE_MERCHANTS, SAMPLE_PIN, sampleStudent } from '../lib/sample'
import { pushQueue } from '../lib/settle'

export type MeLogin = Student & { sample: boolean }

/** Sample block and transaction from the board, used only when there is no API to settle with. */
export const SAMPLE_BLOCK = 52418903
export const SAMPLE_TX = '0x41d0b7c2e9a1f0d3b5c8e7a6f4d2b1c0e9f8a7d6c5b4a3f2e1d0c9b8a7f677e2'

type Snack = { id: string; text: string } | null

type Me = {
  online: boolean
  me: MeLogin | null
  ready: boolean
  introSeen: boolean
  receipts: QueuedReceipt[]
  pending: number
  snack: Snack
  dismissSnack: () => void
  login: (studentNo: string, pin: string) => Promise<void>
  logout: () => Promise<void>
  seeIntro: () => void
  addScanned: (text: string) => Promise<string | null>
  simulateScan: () => Promise<string>
  settleNow: (id?: string) => Promise<void>
}

const Ctx = createContext<Me | null>(null)
export const useMe = () => {
  const c = useContext(Ctx)
  if (!c) throw new Error('useMe outside MeProvider')
  return c
}

const day = 86_400_000

/** Board sample history for the sample student (top-up, a failed and a settled payment). */
async function seedSampleHistory(s: Student) {
  if ((await db.meReceipts.count()) > 0) return
  const now = Date.now()
  const base = { from: s.address, uidHash: s.uidHash, studentName: 'Juan D.', txHash: null, blockNumber: null, failReason: null }
  await db.meReceipts.bulkPut([
    { ...base, id: 'sample-topup', to: s.address, amount: 50000, createdAt: now - 45 * 60_000, merchantId: 'cashier', merchantName: 'Cashier top-up', status: 'settled', kind: 'topup', txHash: SAMPLE_TX, blockNumber: SAMPLE_BLOCK - 210 },
    { ...base, id: 'sample-drinks', to: SAMPLE_MERCHANTS[1].address, amount: 2500, createdAt: now - day - 3 * 3600_000, merchantId: 'm2', merchantName: "Ate's Drinks", item: 'Juice', status: 'failed', failReason: 'INSUFFICIENT' },
    { ...base, id: 'sample-library', to: SAMPLE_MERCHANTS[0].address, amount: 6000, createdAt: now - day - 6 * 3600_000, merchantId: 'm3', merchantName: 'Library Café', item: 'Coffee', status: 'settled', txHash: SAMPLE_TX, blockNumber: SAMPLE_BLOCK - 5000 },
  ])
}

export function MeProvider({ children }: { children: ReactNode }) {
  const online = useOnline()
  const [me, setMe] = useState<MeLogin | null>(null)
  const [introSeen, setIntroSeen] = useState(false)
  const [ready, setReady] = useState(false)
  const [snack, setSnack] = useState<Snack>(null)
  const receipts = useLive(() => db.meReceipts.orderBy('createdAt').reverse().toArray(), [], [] as QueuedReceipt[])
  const pending = receipts.filter((r) => r.status === 'pending' && r.kind !== 'topup').reduce((s, r) => s + r.amount, 0)

  useEffect(() => {
    void Promise.all([getMeta<MeLogin>('me'), getMeta<boolean>('introSeen')]).then(([m, i]) => {
      setMe(m ?? null)
      setIntroSeen(!!i)
      setReady(true)
    })
  }, [])

  // Announce each receipt that flips to Settled.
  const announce = useCallback((before: QueuedReceipt[]) => {
    void db.meReceipts.toArray().then((after) => {
      const was = new Map(before.map((r) => [r.id, r.status]))
      const flipped = after.find((r) => r.status === 'settled' && was.get(r.id) === 'pending')
      if (flipped) setSnack({ id: flipped.id, text: `₱${(flipped.amount / 100).toFixed(2)} at ${flipped.merchantName} settled` })
    })
  }, [])

  const settleNow = useCallback(
    async (id?: string) => {
      if (!me) return
      const before = await db.meReceipts.toArray()
      let balance = me.balance
      try {
        await pushQueue(db.meReceipts)
        // The on-chain balance changed: read it again.
        balance = (await api.byUid(me.uidHash)).balance
      } catch (e) {
        if (!me.sample) throw e instanceof ApiError ? e : new Error('No signal')
        // No API reachable: on the sample login, stamp it with the board's sample block (labelled Sample on screen)
        // and move the sample balance the way the contract would.
        const ids = id ? [id] : before.filter((r) => r.status === 'pending').map((r) => r.id)
        await Promise.all(ids.map((x) => db.meReceipts.update(x, { status: 'settled', txHash: SAMPLE_TX, blockNumber: SAMPLE_BLOCK })))
        balance -= before.filter((r) => ids.includes(r.id) && r.status === 'pending').reduce((s, r) => s + r.amount, 0)
      }
      if (balance !== me.balance) {
        const next = { ...me, balance }
        setMe(next)
        await setMeta('me', next)
      }
      announce(before)
    },
    [me, announce],
  )

  // Settle the moment the phone has signal (PRD: window 'online' -> push).
  useEffect(() => {
    if (online && me && !me.sample) void settleNow().catch(() => {})
  }, [online, me]) // eslint-disable-line react-hooks/exhaustive-deps

  const value = useMemo<Me>(
    () => ({
      online,
      me,
      ready,
      introSeen,
      receipts,
      pending,
      snack,
      dismissSnack: () => setSnack(null),
      seeIntro: () => {
        setIntroSeen(true)
        void setMeta('introSeen', true)
      },
      login: async (studentNo, pin) => {
        let m: MeLogin
        try {
          m = { ...(await api.login({ studentNo, pin })), sample: false }
        } catch (e) {
          if (e instanceof ApiError) throw new Error(e.status === 401 ? 'Wrong student number or PIN.' : e.message)
          const s = await sampleStudent()
          if (studentNo.trim().toUpperCase() !== s.studentNo || pin !== SAMPLE_PIN) throw new Error('No signal. Log in needs signal the first time.')
          m = { uidHash: s.uidHash, studentNo: s.studentNo, name: s.name, address: s.address, balance: s.balance, sample: true }
          await seedSampleHistory(m)
        }
        await setMeta('me', m)
        setMe(m)
      },
      logout: async () => {
        await db.meta.delete('me')
        await db.meReceipts.clear()
        setMe(null)
      },
      addScanned: async (text) => {
        const r = decodeReceipt(text)
        if (!r) return null
        const existing = await db.meReceipts.get(r.id)
        if (!existing) await db.meReceipts.put({ ...r, status: 'pending', txHash: null, blockNumber: null, failReason: null })
        if (online && me && !me.sample) void settleNow().catch(() => {})
        return r.id
      },
      simulateScan: async () => {
        // Same-phone demo: take the receipt this phone just made on /pos, else a sample one.
        const latest = await db.posQueue.orderBy('createdAt').last()
        const last = latest && !(await db.meReceipts.get(latest.id)) ? latest : undefined
        const s = await sampleStudent()
        const r: QueuedReceipt = last
          ? { ...last, status: 'pending', txHash: null, blockNumber: null, failReason: null }
          : {
              id: crypto.randomUUID(), from: s.address, to: SAMPLE_MERCHANTS[0].address, amount: 8500, createdAt: Date.now(),
              uidHash: s.uidHash, merchantId: 'm1', item: 'Rice meal', merchantName: SAMPLE_MERCHANTS[0].name, studentName: 'Juan D.',
              status: 'pending', txHash: null, blockNumber: null, failReason: null,
            }
        await db.meReceipts.put(r)
        return r.id
      },
      settleNow,
    }),
    [online, me, ready, introSeen, receipts, pending, snack, settleNow],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

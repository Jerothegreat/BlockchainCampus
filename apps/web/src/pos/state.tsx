// Stall POS state shared by the /pos screens: the sale in progress, the NFC reader,
// the /sync cache and the queue push on `online`.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { api, type Merchant, type SyncStudent } from '../lib/api'
import { db, getMeta, setMeta } from '../lib/db'
import { useLive, useOnline } from '../lib/hooks'
import { pushQueue } from '../lib/settle'
import { normalizeUid, hashUid } from '../lib/uid'
import { useNfc } from '../hooks/useNfc'
import { SAMPLE_UID, seedSampleIfEmpty } from '../lib/sample'

/** Chip UID used by the "Demo: ID tapped" button: the sample student, or link it once on /cashier. */
export const DEMO_UID = SAMPLE_UID

export type Tapped = { uid: string; uidHash: string; student: SyncStudent | null }

type Pos = {
  online: boolean
  merchant: Merchant | null
  syncedAt: number | null
  queueCount: number
  lastPush: { at: number; ok: boolean } | null
  amount: string // keypad digits, whole pesos
  setAmount: (a: string) => void
  item: string | null
  setItem: (i: string | null) => void
  tapped: Tapped | null
  nfc: ReturnType<typeof useNfc>
  /** Start the NFC scan from the Charge tap (Web NFC needs a user gesture), then go to Tap. */
  charge: () => void
  demoTap: () => Promise<void>
  sync: () => Promise<void>
  push: () => Promise<void>
  reset: () => void
}

const Ctx = createContext<Pos | null>(null)
export const usePos = () => {
  const c = useContext(Ctx)
  if (!c) throw new Error('usePos outside PosProvider')
  return c
}

async function lookup(serialOrUid: string): Promise<Tapped> {
  const uid = normalizeUid(serialOrUid)
  const uidHash = await hashUid(uid)
  return { uid, uidHash, student: (await db.students.get(uidHash)) ?? null }
}

export function PosProvider({ children }: { children: ReactNode }) {
  const online = useOnline()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [amount, setAmount] = useState('85')
  const [item, setItem] = useState<string | null>(null)
  const [tapped, setTapped] = useState<Tapped | null>(null)
  const [stallId, setStallId] = useState<string | null>(null)
  const [lastPush, setLastPush] = useState<Pos['lastPush']>(null)

  const merchants = useLive(() => db.merchants.toArray(), [], [] as Merchant[])
  const syncedAt = useLive(() => getMeta<number>('syncedAt'), [], undefined) ?? null
  const queueCount = useLive(() => db.posQueue.where('status').equals('pending').count(), [], 0)
  const merchant = merchants.find((m) => m.id === stallId) ?? merchants[0] ?? null

  // Which stall this phone is: ?stall=<id> once, then remembered (no board screen for this yet).
  useEffect(() => {
    const fromUrl = params.get('stall')
    if (fromUrl) {
      setStallId(fromUrl)
      void setMeta('stallId', fromUrl)
    } else void getMeta<string>('stallId').then((s) => s && setStallId(s))
  }, [params])

  const onTapRef = useRef<(serial: string) => void>(() => {})
  const nfc = useNfc((tap) => onTapRef.current(tap.serialNumber))
  onTapRef.current = (serial) => {
    void lookup(serial).then((t) => {
      setTapped(t)
      nfc.stopScan()
      if (t.student) navigate('/pos/confirm')
    })
  }

  const sync = useCallback(async () => {
    const res = await api.sync(merchant?.id, queueCount)
    await db.transaction('rw', db.students, db.merchants, db.meta, async () => {
      await db.students.clear()
      await db.students.bulkPut(res.students)
      await db.merchants.clear()
      await db.merchants.bulkPut(res.merchants)
      await setMeta('syncedAt', res.syncedAt)
    })
  }, [merchant?.id, queueCount])

  const push = useCallback(async () => {
    try {
      await pushQueue(db.posQueue)
      setLastPush({ at: Date.now(), ok: true })
    } catch {
      setLastPush({ at: Date.now(), ok: false })
    }
  }, [])

  // Sync and push whenever signal comes back, and once on open. No API reachable and nothing
  // cached: fall back to labelled sample data so the screens still work.
  useEffect(() => {
    if (!online) {
      void seedSampleIfEmpty()
      return
    }
    void push().then(() => sync().catch(() => seedSampleIfEmpty()))
  }, [online]) // eslint-disable-line react-hooks/exhaustive-deps

  const value = useMemo<Pos>(
    () => ({
      online,
      merchant,
      syncedAt,
      queueCount,
      lastPush,
      amount,
      setAmount,
      item,
      setItem,
      tapped,
      nfc,
      charge: () => {
        setTapped(null)
        if (nfc.isSupported) void nfc.startScan()
        navigate('/pos/tap')
      },
      demoTap: async () => {
        const t = await lookup(DEMO_UID)
        setTapped(t)
        nfc.stopScan()
        if (t.student) navigate('/pos/confirm')
      },
      sync,
      push,
      reset: () => {
        setTapped(null)
        setItem(null)
        setAmount('0')
      },
    }),
    [online, merchant, syncedAt, queueCount, lastPush, amount, item, tapped, nfc, navigate, sync, push],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

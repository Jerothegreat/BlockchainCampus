// Stall POS state shared by the /pos screens: this phone's stall and device key, the sale in progress,
// the card reader, the /sync cache and the queue push on `online`.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import type { Address } from 'viem'
import { ApiError, api, errorText, type Merchant, type SyncStudent } from '../lib/api'
import { cardIdOf, decodeCard, verifyCardState, type CardRecord } from '../lib/card'
import { cachedChainInfo, chainInfo } from '../lib/chain'
import { db, getMeta, setMeta } from '../lib/db'
import { deviceAccount } from '../lib/device'
import { useLive, useOnline } from '../lib/hooks'
import { checkCard, type CheckResult } from '../lib/pay'
import { pushQueue } from '../lib/settle'
import { prepareSaleSound } from '../lib/saleSound'
import { useCard, type CardTap } from '../hooks/useCard'

export type Tapped = { tap: CardTap; record: CardRecord; student: SyncStudent }
/** Why a tapped card was refused before the PIN (shown as a dialog on the Tap screen). */
export type TapProblem = Exclude<CheckResult, { ok: true }> | { ok: false; reason: 'blank' | 'unreadable' | 'forged' | 'unlinked' | 'no-sync' }

type Pos = {
  online: boolean
  device: Address | null
  merchant: Merchant | null
  syncedAt: number | null
  syncError: string | null
  queueCount: number
  lastPush: { at: number; ok: boolean } | null
  amount: string // keypad digits, whole pesos
  setAmount: (a: string) => void
  item: string | null
  setItem: (i: string | null) => void
  tapped: Tapped | null
  tapProblem: TapProblem | null
  clearTapProblem: () => void
  card: ReturnType<typeof useCard>
  /** Start the NFC scan from the Charge tap (Web NFC needs a user gesture), then go to Tap. */
  charge: () => void
  registerStall: (name: string) => Promise<void>
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

export function PosProvider({ children }: { children: ReactNode }) {
  const online = useOnline()
  const navigate = useNavigate()
  const [amount, setAmount] = useState('85')
  const [item, setItem] = useState<string | null>(null)
  const [tapped, setTapped] = useState<Tapped | null>(null)
  const [tapProblem, setTapProblem] = useState<TapProblem | null>(null)
  const [device, setDevice] = useState<Address | null>(null)
  const [lastPush, setLastPush] = useState<Pos['lastPush']>(null)
  const [syncError, setSyncError] = useState<string | null>(null)

  const merchants = useLive(() => db.merchants.toArray(), [], [] as Merchant[])
  const syncedAt = useLive(() => getMeta<number>('syncedAt'), [], undefined) ?? null
  const queueCount = useLive(() => db.posQueue.where('status').equals('pending').count(), [], 0)
  // This phone's stall: the one registered with this device key.
  const merchant = merchants.find((m) => device && m.deviceAddress?.toLowerCase() === device.toLowerCase()) ?? null

  useEffect(() => {
    void deviceAccount().then((a) => setDevice(a.address))
  }, [])

  const sync = useCallback(async () => {
    try {
      await chainInfo()
      const res = await api.sync()
      await db.transaction('rw', db.students, db.merchants, db.meta, async () => {
        await db.students.clear()
        await db.students.bulkPut(res.students)
        await db.merchants.clear()
        await db.merchants.bulkPut(res.merchants)
        await setMeta('syncedAt', res.syncedAt)
      })
      const chain = await cachedChainInfo()
      if (chain && chain.cardSigner !== res.cardSigner) await setMeta('chain', { ...chain, cardSigner: res.cardSigner })
      setSyncError(null)
    } catch (e) {
      // Not registered yet: /sync refuses this device. Still cache the stall list so setup can tell.
      if (e instanceof ApiError && e.status === 401) await db.merchants.bulkPut(await api.merchants().catch(() => []))
      setSyncError(errorText(e))
      throw e
    }
  }, [])

  const push = useCallback(async () => {
    try {
      await pushQueue(db.posQueue)
      setLastPush({ at: Date.now(), ok: true })
    } catch {
      setLastPush({ at: Date.now(), ok: false })
    }
  }, [])

  // Push and sync whenever signal comes back, and once on open.
  useEffect(() => {
    if (online) void push().then(() => sync().catch(() => undefined))
  }, [online]) // eslint-disable-line react-hooks/exhaustive-deps

  const onTap = async (tap: CardTap) => {
    const refuse = (p: TapProblem) => setTapProblem(p)
    if (!tap.card) return refuse({ ok: false, reason: 'blank' })
    const record = decodeCard(tap.card)
    if (!record) return refuse({ ok: false, reason: 'unreadable' })
    let student = await db.students.get(tap.uidHash)
    if (!student && navigator.onLine) {
      await sync().catch(() => undefined) // registered after our last sync
      student = await db.students.get(tap.uidHash)
    }
    if (!student) return refuse({ ok: false, reason: 'unlinked' })
    const chain = await cachedChainInfo()
    if (!chain) return refuse({ ok: false, reason: 'no-sync' })
    if (!(await verifyCardState(chain, cardIdOf(tap.uidHash), record.state))) return refuse({ ok: false, reason: 'forged' })
    const queued = await db.posQueue.where('uidHash').equals(tap.uidHash).filter((r) => r.status === 'pending' && r.cardNonce === record.state.nonce).count()
    const check = checkCard({ record, student, queuedOnThisNonce: queued > 0 })
    if (!check.ok) return refuse(check)
    card.stop()
    setTapped({ tap, record, student })
    navigate('/pos/confirm')
  }
  const onTapRef = useRef(onTap)
  onTapRef.current = onTap
  const card = useCard((t) => void onTapRef.current(t))

  const registerStall = useCallback(
    async (name: string) => {
      const account = await deviceAccount()
      const m = await api.registerStall({ name, deviceAddress: account.address })
      await db.merchants.put(m)
      await sync().catch(() => undefined)
    },
    [sync],
  )

  const value = useMemo<Pos>(
    () => ({
      online,
      device,
      merchant,
      syncedAt,
      syncError,
      queueCount,
      lastPush,
      amount,
      setAmount,
      item,
      setItem,
      tapped,
      tapProblem,
      clearTapProblem: () => setTapProblem(null),
      card,
      charge: () => {
        prepareSaleSound()
        setTapped(null)
        setTapProblem(null)
        if (card.nfc.isSupported) void card.start()
        navigate('/pos/tap')
      },
      registerStall,
      sync,
      push,
      reset: () => {
        setTapped(null)
        setItem(null)
        setAmount('0')
      },
    }),
    [online, device, merchant, syncedAt, syncError, queueCount, lastPush, amount, item, tapped, tapProblem, card, navigate, registerStall, sync, push],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

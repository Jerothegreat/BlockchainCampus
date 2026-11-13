// /pos screens, 1:1 with docs/design/board-A/pos-*.html.
import { useEffect, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router'
import { api, errorText } from '../lib/api'
import { cardIdOf, encodeCard } from '../lib/card'
import { cachedChainInfo, NETWORK, txUrl } from '../lib/chain'
import { db, type QueuedReceipt } from '../lib/db'
import { signReceipt } from '../lib/device'
import { clock, useLive } from '../lib/hooks'
import { PIN_LENGTH, PIN_LOCK_MS, PIN_TRIES, capOf, checkAmount, pesos, type CheckResult } from '../lib/pay'
import { pinMatches } from '../lib/pin'
import {
  AppColumn, Avatar, Banner, Button, Card, Chip, Dialog, EmptyState, Icon, Keypad, List, ListItem, NavBar, NetChip,
  SampleTag, StatusChip, TextField, TopBar, type NavItem,
} from '../ui'
import { DemoCards } from '../ui/DemoCards'
import { ReceiptSlip } from '../ui/ReceiptSlip'
import { usePos, type TapProblem } from './state'

const NAV: NavItem[] = [
  { to: '/pos', icon: 'point_of_sale', label: 'Charge' },
  { to: '/pos/today', icon: 'insights', label: 'Today' },
  { to: '/pos/queue', icon: 'sync', label: 'Queue' },
]

/** Sample quick items until the owner sends real stall menus. */
const QUICK = [
  { label: 'Rice meal', pesos: 85 },
  { label: 'Siomai', pesos: 40 },
  { label: 'Juice', pesos: 25 },
]

const centavos = (digits: string) => Number(digits || '0') * 100
const shortNo = (no: string) => (no.length > 8 ? `${no.slice(0, 5)}…${no.slice(-3)}` : no)
const shortUid = (uid: string) => '…' + uid.slice(-4).toUpperCase().replace(/(..)(..)/, '$1:$2')
const firstName = (name: string) => {
  const [first, last] = name.split(' ')
  return last ? `${first} ${last[0]}.` : first
}

/* ---------- Setup (first run: register this phone as a stall) ---------- */

function PosSetup() {
  const pos = usePos()
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const submit = async () => {
    setBusy(true)
    setError(null)
    try {
      await pos.registerStall(name.trim())
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <AppColumn>
      <TopBar title="Set up this stall" back="/app" actions={<NetChip online={pos.online} />} />
      <div className="flex flex-1 flex-col gap-5 px-4 py-6">
        <p className="text-body-l text-on-surface-variant">
          This phone becomes the stall's register. It makes its own signing key, so receipts it prints can't be faked.
        </p>
        <TextField id="stall-name" label="Stall name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Kuya's Grill" />
        <p className="font-mono text-body-s text-on-surface-variant break-all">Device {pos.device ?? '…'}</p>
        {error && <Banner tone="error" icon="error" title="Could not register">{error}</Banner>}
        {!pos.online && <Banner tone="warning" icon="cloud_off" title="Needs signal once">Connect to register; after that, charging works offline.</Banner>}
        <div className="mt-auto mb-4">
          <Button size="l" full icon="storefront" disabled={busy || !pos.online || name.trim().length === 0} onClick={() => void submit()}>
            {busy ? 'Registering on-chain…' : 'Register stall'}
          </Button>
        </div>
      </div>
    </AppColumn>
  )
}

/* ---------- Charge (keypad) ---------- */

export function PosKeypad() {
  const pos = usePos()
  const { amount, setAmount, item, setItem } = pos
  const synced = pos.syncedAt != null

  const key = (k: string) => {
    setItem(null)
    let a = amount
    if (k === 'C') a = '0'
    else if (k === 'backspace') a = a.slice(0, -1) || '0'
    else a = (a === '0' ? '' : a) + k
    setAmount(a.slice(0, 5))
  }

  if (pos.device && !pos.merchant) return <PosSetup />

  return (
    <AppColumn rail>
      <TopBar title={pos.merchant?.name ?? 'Stall'} back="/app" actions={<NetChip online={pos.online} />} />
      <div className="flex flex-1 flex-col gap-4 px-4 py-3">
        <div className="flex items-center justify-between text-body-s text-on-surface-variant">
          <span>{synced ? `Synced ${clock(pos.syncedAt!)}, ${pos.queueCount} in queue` : 'Not synced yet'}</span>
        </div>
        {!synced && (
          <Banner tone="warning" icon="sync_problem" title="Student list not synced">
            {pos.syncError ?? 'Connect once to sync. Charging is off until then.'}
          </Banner>
        )}
        <div className="py-2 text-center">
          <p className="text-label-l text-on-surface-variant">Amount</p>
          <p className="font-display font-semibold tabular-nums text-display-m">{pesos(centavos(amount))}</p>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Quick items">
          {QUICK.map((q) => (
            <Chip
              key={q.label}
              selected={item === q.label}
              onClick={() => {
                setItem(q.label)
                setAmount(String(q.pesos))
              }}
            >
              {q.label} {q.pesos}
            </Chip>
          ))}
          <SampleTag />
        </div>
        <Keypad mode="amount" onKey={key} />
        <div className="pb-4">
          <Button size="l" full disabled={!synced || centavos(amount) <= 0} onClick={pos.charge}>
            Charge {pesos(centavos(amount))}
          </Button>
        </div>
      </div>
      <NavBar items={NAV} active="/pos" />
    </AppColumn>
  )
}

/* ---------- Tap ID ---------- */

export function PosTap() {
  const pos = usePos()
  const navigate = useNavigate()
  const cancel = () => {
    pos.card.stop()
    pos.clearTapProblem()
    navigate('/pos')
  }
  return (
    <AppColumn>
      <TopBar title={`Charge ${pesos(centavos(pos.amount))}`} back={cancel} actions={<NetChip online={pos.online} />} />
      <div className="flex flex-1 flex-col px-4">
        <div className="flex flex-col items-center gap-5 py-10 text-center">
          <div className="relative grid h-44 w-44 place-items-center rounded-full bg-surface-container-high text-primary">
            <span className="nfc-ring absolute inset-0 rounded-full border-2 border-primary" />
            <Icon name="contactless" size={72} />
          </div>
          <p className="font-display text-headline-s font-semibold">Student, tap your ID</p>
          <p className="max-w-[30ch] text-body-l text-on-surface-variant">Hold the ID flat on the back of this phone.</p>
        </div>
        {!pos.card.nfc.isSupported && (
          <Banner tone="warning" icon="nfc" title="NFC is off">
            Turn on NFC in Android settings and open this page in Chrome.
          </Banner>
        )}
        {pos.card.nfc.error && pos.card.nfc.isSupported && <p className="text-center text-body-m text-error">{pos.card.nfc.error}</p>}
        <div className="mt-auto mb-4 space-y-2">
          <DemoCards onTap={(uid) => void pos.card.tapVirtual(uid)} />
          <Button variant="text" full onClick={cancel}>
            Cancel
          </Button>
        </div>
      </div>
      {pos.tapProblem && <TapDialog problem={pos.tapProblem} onClose={pos.clearTapProblem} onCancel={cancel} />}
    </AppColumn>
  )
}

function TapDialog({ problem, onClose, onCancel }: { problem: TapProblem; onClose: () => void; onCancel: () => void }) {
  const ok = (label = 'OK') => <Button variant="text" onClick={onCancel}>{label}</Button>
  const again = <Button variant="text" onClick={onClose}>Tap again</Button>
  switch (problem.reason) {
    case 'blank':
      return <Dialog icon="badge" title="No wallet on this ID" actions={<>{ok('Cancel')}{again}</>}>This ID has not been registered. The student registers it in the app, or at the cashier.</Dialog>
    case 'unlinked':
      return <Dialog icon="badge" title="This ID is not linked" actions={<>{ok('Cancel')}{again}</>}>Its wallet is not in this stall's student list. Connect to sync, or send the student to the cashier.</Dialog>
    case 'unreadable':
      return <Dialog icon="error" title="Could not read the wallet" actions={<>{ok('Cancel')}{again}</>}>Hold the ID still until the phone buzzes, then try again.</Dialog>
    case 'forged':
      return <Dialog icon="shield" title="Wallet record is not genuine" actions={ok()}>The balance on this ID was not signed by UMak Pay. Do not accept it.</Dialog>
    case 'pending':
      return <Dialog icon="schedule" title="A payment is still pending" actions={ok()}>This ID paid somewhere and hasn't settled yet. The student taps it on a phone with signal first, then pays again.</Dialog>
    case 'stale':
      return <Dialog icon="sync_problem" title="Old copy of the wallet" actions={ok()}>This ID holds an outdated balance. The student taps it on a phone with signal to refresh it.</Dialog>
    case 'blocked':
      return <Dialog icon="cancel" title="This ID is blocked" actions={ok()}>A copied or rolled-back card was detected. Pay at the cashier.</Dialog>
    case 'no-sync':
      return <Dialog icon="sync_problem" title="Sync this phone first" actions={ok()}>Connect once so this phone can check wallet signatures offline.</Dialog>
    default:
      return <Dialog icon="error" title="Card refused" actions={ok()}>{problem.reason}</Dialog>
  }
}

/* ---------- Confirm ---------- */

export function PosConfirm() {
  const pos = usePos()
  const t = pos.tapped
  if (!t) return <Navigate to="/pos" replace />
  const s = t.student
  const cap = capOf(s)
  return (
    <AppColumn>
      <TopBar title="Confirm payment" back="/pos/tap" actions={<NetChip online={pos.online} />} />
      <div className="flex flex-1 flex-col gap-5 px-4 py-6">
        <Card>
          <div className="flex items-center gap-4">
            <Avatar icon="person" />
            <div className="min-w-0 flex-1">
              <p className="text-title-l font-semibold">{firstName(s.name)}</p>
              <p className="font-mono text-body-m text-on-surface-variant">
                {shortNo(s.studentNo)}, ID {shortUid(t.tap.uid)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-label-m text-on-surface-variant">On card</p>
              <p className="text-title-m font-semibold tabular-nums">{pesos(t.record.state.balance)}</p>
            </div>
          </div>
        </Card>
        <div className="text-center">
          <p className="text-body-l text-on-surface-variant">Pay to {pos.merchant?.name}</p>
          <p className="font-display text-display-m font-bold tabular-nums">{pesos(centavos(pos.amount))}</p>
        </div>
        {Number.isFinite(cap) && (
          <p className="text-center text-body-m text-on-surface-variant">
            Offline limit for this ID: <span className="font-semibold text-on-surface tabular-nums">{pesos(cap)}</span>
          </p>
        )}
        <div className="mt-auto mb-4 grid grid-cols-2 gap-3">
          <Button size="l" variant="outlined" full to="/pos">Cancel</Button>
          <Button size="l" full to="/pos/pin">Confirm</Button>
        </div>
        <p className="-mt-2 mb-4 text-center text-body-s text-on-surface-variant">Not you? Cancel and tap again.</p>
      </div>
    </AppColumn>
  )
}

/* ---------- PIN (errors open as dialogs over this screen) ---------- */

type Problem =
  | Exclude<CheckResult, { ok: true }>
  | { ok: false; reason: 'wrong-pin'; left: number }
  | { ok: false; reason: 'locked' }
  | { ok: false; reason: 'write'; message: string }

type Phase = 'pin' | 'writing' | 'settling' | 'clearing'

export function PosPin() {
  const pos = usePos()
  const navigate = useNavigate()
  const [pin, setPin] = useState('')
  const [phase, setPhase] = useState<Phase>('pin')
  const [problem, setProblem] = useState<Problem | null>(null)
  const t = pos.tapped
  const amount = centavos(pos.amount)

  const submit = async (entered: string) => {
    if (!t || !pos.merchant) return
    const { tap, record, student: s } = t
    const lock = await db.locks.get(tap.uidHash)
    if (lock && lock.until > Date.now()) return setProblem({ ok: false, reason: 'locked' })

    if (!(await pinMatches(entered, tap.uid, s))) {
      const tries = (lock && lock.until === 0 ? lock.tries : 0) + 1
      const locked = tries >= PIN_TRIES
      await db.locks.put({ uidHash: tap.uidHash, tries: locked ? 0 : tries, until: locked ? Date.now() + PIN_LOCK_MS : 0 })
      setPin('')
      return setProblem(locked ? { ok: false, reason: 'locked' } : { ok: false, reason: 'wrong-pin', left: PIN_TRIES - tries })
    }
    await db.locks.delete(tap.uidHash)

    const check = checkAmount({ amount, record, student: s })
    if (!check.ok) {
      setPin('')
      return setProblem(check)
    }

    // Sign the receipt with this stall's device key, offline.
    const chain = await cachedChainInfo()
    if (!chain) return setProblem({ ok: false, reason: 'write', message: 'Sync this phone once first.' })
    const receipt = await signReceipt(chain, {
      id: crypto.randomUUID(),
      cardId: cardIdOf(tap.uidHash),
      to: pos.merchant.address,
      amount,
      createdAt: Date.now(),
      cardNonce: record.state.nonce,
    })

    // Write PENDING onto the card first: the sale only counts once the card carries it.
    const pendingCard = encodeCard({ state: record.state, pending: { id: receipt.id, to: receipt.to, amount, createdAt: receipt.createdAt, sig: receipt.sig } })
    setPhase('writing')
    try {
      await pos.card.write(tap, pendingCard)
    } catch (e) {
      setPhase('pin')
      setPin('')
      return setProblem({ ok: false, reason: 'write', message: e instanceof Error ? e.message : String(e) })
    }
    const queued: QueuedReceipt = {
      ...receipt,
      uidHash: tap.uidHash,
      studentName: firstName(s.name),
      merchantName: pos.merchant.name,
      ...(pos.item ? { item: pos.item } : {}),
      status: 'pending',
      reason: null,
      txHash: null,
      explorer: null,
    }
    await db.posQueue.put(queued)

    // Online right now: settle it and hand the card back clear (API.md step 7). Best effort; the
    // receipt stays queued and the student's phone can settle it later.
    if (navigator.onLine) {
      try {
        setPhase('settling')
        const res = await api.refresh({ uid: tap.uid, card: pendingCard })
        const mine = res.settled.find((r) => r.id === receipt.id)
        if (mine) await db.posQueue.update(receipt.id, { status: mine.status, reason: mine.reason ?? null, txHash: mine.txHash ?? null, explorer: mine.explorer ?? null })
        setPhase('clearing')
        await pos.card.write(tap, res.card)
      } catch {
        // stays pending
      }
    }
    navigate(`/pos/approved/${receipt.id}`)
  }

  const key = (k: string) => {
    if (problem || phase !== 'pin') return
    const next = k === 'backspace' ? pin.slice(0, -1) : (pin + k).slice(0, PIN_LENGTH)
    setPin(next)
    if (next.length === PIN_LENGTH) setTimeout(() => void submit(next), 150)
  }

  if (!t) return <Navigate to="/pos" replace />
  const close = () => setProblem(null)
  const cancel = () => navigate('/pos')

  return (
    <AppColumn>
      <TopBar title="Enter your PIN" back="/pos/confirm" actions={<NetChip online={pos.online} />} />
      <div className="flex flex-1 flex-col gap-4 px-4 py-5">
        <p className="text-center text-body-l text-on-surface-variant">
          {firstName(t.student.name)}, <span className="font-semibold text-on-surface tabular-nums">{pesos(amount)}</span> to {pos.merchant?.name}
        </p>
        <div className="flex justify-center gap-5 py-2" aria-live="polite" aria-label={`${pin.length} of ${PIN_LENGTH} digits`}>
          {Array.from({ length: PIN_LENGTH }, (_, i) => (
            <span key={i} className="h-4 w-4 rounded-full border-2 border-on-surface" style={{ background: i < pin.length ? 'var(--on-surface)' : 'transparent' }} />
          ))}
        </div>
        <Keypad mode="pin" onKey={key} />
      </div>
      {phase !== 'pin' && <HoldDialog phase={phase} virtual={t.tap.virtual} />}
      {problem && <PinDialog problem={problem} onClose={close} onCancel={cancel} />}
    </AppColumn>
  )
}

function HoldDialog({ phase, virtual }: { phase: Exclude<Phase, 'pin'>; virtual: boolean }) {
  const text = {
    writing: virtual ? 'Saving the payment to the demo ID…' : 'Keep the ID on the phone. Saving the payment to the card…',
    settling: `Online: settling on ${NETWORK}…`,
    clearing: virtual ? 'Updating the demo ID…' : 'Keep the ID on the phone. Writing the new balance…',
  }[phase]
  return (
    <Dialog icon="contactless" title={phase === 'settling' ? 'Settling' : 'Hold the ID'} actions={<span />}>
      {text}
    </Dialog>
  )
}

function PinDialog({ problem, onClose, onCancel }: { problem: Problem; onClose: () => void; onCancel: () => void }) {
  const navigate = useNavigate()
  const btn = (label: string, fn: () => void) => <Button variant="text" onClick={fn}>{label}</Button>
  const changeAmount = () => navigate('/pos')
  switch (problem.reason) {
    case 'wrong-pin':
      return (
        <Dialog icon="lock" title="Wrong PIN" actions={<>{btn('Cancel', onCancel)}{btn('Try again', onClose)}</>}>
          {problem.left} {problem.left === 1 ? 'try' : 'tries'} left. After {PIN_TRIES} wrong tries this ID is locked on this phone for {PIN_LOCK_MS / 60_000} minutes.
        </Dialog>
      )
    case 'locked':
      return (
        <Dialog icon="lock" title="This ID is locked" actions={btn('OK', onCancel)}>
          Too many wrong PINs. Try again in {PIN_LOCK_MS / 60_000} minutes.
        </Dialog>
      )
    case 'over-cap':
      return (
        <Dialog icon="speed" title="Over the offline limit" actions={<>{btn('Cancel', onCancel)}{btn('Change amount', changeAmount)}</>}>
          This ID can spend up to {pesos(problem.limit)} with no signal. Charge {pesos(problem.limit)} or less.
        </Dialog>
      )
    case 'insufficient':
      return (
        <Dialog icon="account_balance_wallet" title="Not enough balance" actions={<>{btn('Cancel', onCancel)}{btn('Change amount', changeAmount)}</>}>
          Balance on this ID: {pesos(problem.available)}. The student can top up in the app.
        </Dialog>
      )
    case 'write':
      return (
        <Dialog icon="contactless" title="Payment not saved" actions={<>{btn('Cancel', onCancel)}{btn('Try again', onClose)}</>}>
          The card was moved before the payment was written ({problem.message}). Nothing was charged. Enter the PIN again and keep the ID on the phone.
        </Dialog>
      )
    case 'blocked':
      return (
        <Dialog icon="flag" title="Offline payments paused for this ID" actions={btn('OK', onCancel)}>
          Pay at the cashier.
        </Dialog>
      )
    default:
      return (
        <Dialog icon="speed" title="Enter an amount" actions={btn('OK', changeAmount)}>
          The amount must be more than ₱0.00.
        </Dialog>
      )
  }
}

/* ---------- Approved ---------- */

export function PosApproved() {
  const pos = usePos()
  const navigate = useNavigate()
  const { id = '' } = useParams()
  const r = useLive(() => db.posQueue.get(id), [id], undefined)

  const next = () => {
    pos.reset()
    navigate('/pos')
  }
  // Back to the keypad after 20 s (or Next sale).
  useEffect(() => {
    const t = setTimeout(next, 20_000)
    return () => clearTimeout(t)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (!r) return null
  return (
    <AppColumn>
      <TopBar title="Approved" back={next} actions={<NetChip online={pos.online} />} />
      <div className="flex flex-1 flex-col gap-4 px-4 py-5">
        <ReceiptSlip
          print
          merchant={r.merchantName}
          createdAt={r.createdAt}
          rows={[
            { label: r.item ?? 'Sale', value: (r.amount / 100).toFixed(2) },
            { label: 'Paid by', value: r.studentName, muted: true },
          ]}
          total={r.amount}
          id={r.id}
          stamp={r.status === 'settled' ? { kind: 'settled', block: null } : r.status === 'pending' ? { kind: 'pending' } : undefined}
        />
        <p className="text-center text-body-m text-on-surface-variant">
          {r.status === 'settled' ? (
            <>
              Settled on {NETWORK}.{' '}
              {r.txHash && <a className="font-semibold text-primary underline" href={txUrl(r.txHash)} target="_blank" rel="noreferrer">View transaction</a>}
            </>
          ) : r.status === 'pending' ? (
            'Saved on the ID and in this phone’s queue. It settles when either phone gets signal.'
          ) : (
            `Refused at settlement: ${r.reason ?? r.status}.`
          )}
        </p>
        <div className="mt-auto space-y-3 pb-4">
          <div className="h-1 w-full overflow-hidden rounded-full bg-surface-container-highest" role="progressbar" aria-label="Time left">
            <div className="countdown h-full bg-primary" />
          </div>
          <p className="text-center text-body-s text-on-surface-variant">Back to the keypad in 20 s.</p>
          <Button size="l" full onClick={next}>Next sale</Button>
        </div>
      </div>
    </AppColumn>
  )
}

/* ---------- Today ---------- */

const SAMPLE_HOURS = [10, 20, 29, 44, 78, 88, 68, 29, 20, 24]
const HOUR_LABELS = ['7a', '8a', '9a', '10a', '11a', '12p', '1p', '2p', '3p', '4p']

export function PosToday() {
  const pos = usePos()
  const start = new Date().setHours(0, 0, 0, 0)
  const rows = useLive(() => db.posQueue.where('createdAt').aboveOrEqual(start).reverse().sortBy('createdAt'), [start], [] as QueuedReceipt[])
  const total = rows.filter((r) => r.status === 'pending' || r.status === 'settled').reduce((s, r) => s + r.amount, 0)

  // Busy-hours forecast: real counts by hour once there is enough history, sample bars until then.
  const all = useLive(() => db.posQueue.toArray(), [], [] as QueuedReceipt[])
  const real = all.length >= 20
  const counts = HOUR_LABELS.map((_, i) => all.filter((r) => new Date(r.createdAt).getHours() === 7 + i).length)
  const max = Math.max(1, ...counts)
  const heights = real ? counts.map((c) => Math.round((c / max) * 88)) : SAMPLE_HOURS
  const top = [...heights].map((h, i) => [h, i]).sort((a, b) => b[0] - a[0]).slice(0, 3).map(([, i]) => i)
  const peak = heights.indexOf(Math.max(...heights))
  const span = [Math.min(...top), Math.max(...top)]
  const hourText = (i: number) => {
    const h = 7 + i
    return h === 12 ? '12 PM' : h > 12 ? `${h - 12} PM` : `${h} AM`
  }

  return (
    <AppColumn rail>
      <TopBar title="Today" actions={<NetChip online={pos.online} />} />
      <div className="flex flex-1 flex-col gap-5 px-4 py-5">
        <div className="flex items-end justify-between">
          <div>
            <p className="font-display text-display-s font-bold tabular-nums">{pesos(total)}</p>
            <p className="text-body-m text-on-surface-variant">{rows.length} {rows.length === 1 ? 'sale' : 'sales'}</p>
          </div>
        </div>
        <Card>
          <h2 className="flex items-center justify-between text-title-s font-semibold">Busy hours, forecast {!real && <SampleTag />}</h2>
          <div className="mt-3 flex h-28 items-end gap-1.5" role="img" aria-label={`Sales by hour, peak at ${hourText(peak)}`}>
            {heights.map((h, i) => (
              <div key={i} className="flex flex-1 flex-col items-center gap-1">
                <div className={`w-full rounded-t-[4px] ${top.includes(i) ? 'bg-primary' : 'bg-outline-variant'}`} style={{ height: Math.max(h, 2) }} />
                <span className="text-label-s text-on-surface-variant">{HOUR_LABELS[i]}</span>
              </div>
            ))}
          </div>
          <p className="mt-3 text-body-m font-semibold">Prep more stock from {hourText(span[0])} to {hourText(span[1])}.</p>
        </Card>
        {rows.length === 0 ? (
          <EmptyState icon="receipt_long" title="No sales yet today">Charged sales show here, with their status.</EmptyState>
        ) : (
          <List>
            {rows.map((r) => (
              <ListItem
                key={r.id}
                to={`/pos/approved/${r.id}`}
                headline={<>{r.studentName}, <span className="tabular-nums">{pesos(r.amount)}</span></>}
                support={clock(r.createdAt)}
                trail={<StatusChip status={r.status} />}
              />
            ))}
          </List>
        )}
      </div>
      <NavBar items={NAV} active="/pos/today" />
    </AppColumn>
  )
}

/* ---------- Queue ---------- */

export function PosQueue() {
  const pos = usePos()
  const rows = useLive(() => db.posQueue.where('status').equals('pending').reverse().sortBy('createdAt'), [], [] as QueuedReceipt[])
  const [busy, setBusy] = useState(false)
  const pushNow = async () => {
    setBusy(true)
    await pos.push()
    setBusy(false)
  }
  const last = pos.lastPush
  return (
    <AppColumn rail>
      <TopBar title="Queue" actions={<NetChip online={pos.online} />} />
      <div className="flex flex-1 flex-col gap-4 px-4 py-5">
        {rows.length === 0 ? (
          <EmptyState icon="cloud_done" title="All settled">No receipts waiting for signal.</EmptyState>
        ) : (
          <>
            <Banner
              tone="warning"
              icon="cloud_off"
              title={`${rows.length} ${rows.length === 1 ? 'receipt' : 'receipts'} waiting for signal`}
              action={<Button icon="sync" disabled={busy} onClick={() => void pushNow()}>Push now</Button>}
            >
              {last ? `Last try ${clock(last.at)}${last.ok ? '' : ', no signal'}` : 'Not pushed yet'}
            </Banner>
            <List>
              {rows.map((r) => (
                <ListItem
                  key={r.id}
                  lead={<Avatar icon="receipt_long" tone="tertiary" />}
                  headline={<>{r.studentName}, <span className="tabular-nums">{pesos(r.amount)}</span></>}
                  support={<><span className="font-mono">{r.id.slice(0, 8)}</span>, {clock(r.createdAt)}</>}
                  trail={<StatusChip status="pending" />}
                />
              ))}
            </List>
          </>
        )}
        <p className="text-body-s text-on-surface-variant">
          The student’s phone may settle these first; the contract skips any receipt it already settled.
        </p>
      </div>
      <NavBar items={NAV} active="/pos/queue" />
    </AppColumn>
  )
}

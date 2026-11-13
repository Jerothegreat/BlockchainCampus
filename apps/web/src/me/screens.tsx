// /me screens, to docs/design/board-A/me-*.html, on the card-wallet API:
// the student registers their ID, tops it up online, and taps it to settle a pending payment.
import { useEffect, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router'
import type { Hex } from 'viem'
import { ApiError, api, errorText, type HistoryItem, type ReceiptResult } from '../lib/api'
import { decodeCard } from '../lib/card'
import { addressUrl, NETWORK, txUrl } from '../lib/chain'
import { clock } from '../lib/hooks'
import { isPin, pesos } from '../lib/pay'
import type { CardTap } from '../hooks/useCard'
import { AppColumn, Avatar, Banner, Button, Card, Chip, EmptyState, Fab, Icon, List, ListItem, NavBar, NetChip, StatusChip, TextField, TopBar, type NavItem } from '../ui'
import { CardWriter } from '../ui/CardWriter'
import { DemoCards } from '../ui/DemoCards'
import { useMe, type MeLogin } from './state'

const NAV: NavItem[] = [
  { to: '/me', icon: 'home', label: 'Home' },
  { to: '/me/activity', icon: 'receipt_long', label: 'Activity' },
  { to: '/me/profile', icon: 'account_circle', label: 'Profile' },
]
const TOP_UPS = [10000, 20000, 50000, 100000]
const firstName = (n: string) => n.split(' ')[0]
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`
const when = (t: number) => {
  const d = new Date(t)
  return d.toDateString() === new Date().toDateString() ? `Today ${clock(t)}` : `${d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })} ${clock(t)}`
}

/* ---------- Tap step (shared) ---------- */

function TapStep({ title, hint, allowNew, onTap }: { title: string; hint: string; allowNew?: boolean; onTap: (t: CardTap) => void }) {
  const { card, setOnTap } = useMe()
  useEffect(() => {
    setOnTap((t) => {
      card.stop()
      onTap(t)
    })
    return () => setOnTap(null)
  }) // re-register every render so the latest onTap is used
  useEffect(() => () => card.stop(), []) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      <div className="flex flex-col items-center gap-5 py-10 text-center">
        <div className="relative grid h-44 w-44 place-items-center rounded-full bg-surface-container-high text-primary">
          {card.nfc.scanning && <span className="nfc-ring absolute inset-0 rounded-full border-2 border-primary" />}
          <Icon name="contactless" size={72} />
        </div>
        <p className="font-display text-headline-s font-semibold">{title}</p>
        <p className="max-w-[32ch] text-body-l text-on-surface-variant">{hint}</p>
      </div>
      {card.nfc.isSupported ? (
        <Button size="l" full icon="contactless" disabled={card.nfc.scanning} onClick={() => void card.start()}>
          {card.nfc.scanning ? 'Waiting for your ID…' : 'Start scanning'}
        </Button>
      ) : (
        <Banner tone="warning" icon="nfc" title="NFC is not available here">Use Chrome on Android, or a demo ID below.</Banner>
      )}
      {card.nfc.error && <p className="mt-2 text-center text-body-m text-error">{card.nfc.error}</p>}
      <div className="mt-6 mb-6">
        <DemoCards allowNew={allowNew} onTap={(uid) => void card.tapVirtual(uid)} />
      </div>
    </>
  )
}

function Busy({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-4 py-16 text-center">
      <span className="h-10 w-10 animate-spin rounded-full border-4 border-surface-container-highest border-t-primary" aria-hidden="true" />
      <p className="text-body-l text-on-surface-variant">{children}</p>
    </div>
  )
}

function Failed({ message, onBack }: { message: string; onBack: () => void }) {
  return (
    <div className="flex flex-1 flex-col gap-4 py-6">
      <Banner tone="error" icon="error" title="That didn't go through">{message}</Banner>
      <div className="mt-auto mb-4">
        <Button size="l" full onClick={onBack}>Try again</Button>
      </div>
    </div>
  )
}

/** After a refresh, a short line about what settled. */
const settledText = (s: ReceiptResult[]) => {
  const ok = s.filter((r) => r.status === 'settled').length
  const bad = s.filter((r) => r.status === 'failed' || r.status === 'rejected').length
  if (!s.length) return 'Nothing was pending. Your ID shows the latest balance.'
  return [ok && `${ok} ${ok === 1 ? 'payment' : 'payments'} settled on ${NETWORK}`, bad && `${bad} refused`].filter(Boolean).join(', ') + '.'
}

/* ---------- Home (or first run) ---------- */

export function MeHome() {
  const { me } = useMe()
  if (me === undefined) return null
  if (me === null) return <MeStart />
  return <MeDashboard me={me} />
}

type StartView =
  | { kind: 'tap' }
  | { kind: 'register'; tap: CardTap }
  | { kind: 'busy'; text: string }
  | { kind: 'write'; tap: CardTap; card: Hex; login: MeLogin }
  | { kind: 'error'; message: string }

/** First run: tap your ID. A blank ID registers; a registered one logs this phone in (and settles anything pending). */
function MeStart() {
  const { online, remember, reload, card } = useMe()
  const [view, setView] = useState<StartView>({ kind: 'tap' })

  const onTap = async (tap: CardTap) => {
    if (!tap.card) return setView({ kind: 'register', tap })
    setView({ kind: 'busy', text: 'Checking your ID…' })
    try {
      const s = await api.byUid(tap.uidHash)
      const res = await api.refresh({ uid: tap.uid, card: tap.card })
      setView({ kind: 'write', tap, card: res.card, login: { uidHash: s.uidHash, address: s.address, name: s.name, studentNo: s.studentNo } })
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) return setView({ kind: 'register', tap })
      setView({ kind: 'error', message: errorText(e) })
    }
  }

  return (
    <AppColumn>
      <TopBar title={view.kind === 'register' ? 'Register your ID' : 'UMak Pay'} back={view.kind === 'tap' ? '/app' : () => setView({ kind: 'tap' })} actions={<NetChip online={online} />} />
      <div className="flex flex-1 flex-col px-4">
        {view.kind === 'tap' && (
          <>
            <TapStep allowNew title="Tap your student ID" hint="Your ID is your wallet. Tap it to log in, or to register it the first time." onTap={(t) => void onTap(t)} />
            <ol className="mb-6 space-y-2 text-body-m text-on-surface-variant">
              <li>1. Register your ID with your @umak.edu.ph email.</li>
              <li>2. Top up online. The pesos go to your ID’s own wallet on-chain.</li>
              <li>3. Tap your ID at any stall, even with no signal.</li>
            </ol>
          </>
        )}
        {view.kind === 'register' && (
          <RegisterForm
            tap={view.tap}
            onSubmit={async (b) => {
              setView({ kind: 'busy', text: 'Creating your wallet and linking your ID on-chain…' })
              try {
                const res = await api.register({ uid: view.tap.uid, ...b })
                const login = { uidHash: res.uidHash, address: res.address, name: b.name || b.studentNo, studentNo: res.studentNo }
                setView({ kind: 'write', tap: view.tap, card: res.card, login })
              } catch (e) {
                setView({ kind: 'error', message: errorText(e) })
              }
            }}
          />
        )}
        {view.kind === 'busy' && <Busy>{view.text}</Busy>}
        {view.kind === 'write' && (
          <CardWriter
            tap={view.tap}
            card={view.card}
            write={card.write}
            onDone={() => void remember(view.login).then(reload)}
          />
        )}
        {view.kind === 'error' && <Failed message={view.message} onBack={() => setView({ kind: 'tap' })} />}
      </div>
    </AppColumn>
  )
}

function RegisterForm({ tap, onSubmit }: { tap: CardTap; onSubmit: (b: { email: string; studentNo: string; name: string; pin: string }) => void }) {
  const [email, setEmail] = useState('')
  const [studentNo, setStudentNo] = useState('')
  const [name, setName] = useState('')
  const [pin, setPin] = useState('')
  const [pin2, setPin2] = useState('')
  const emailOk = /^[^@\s]+@umak\.edu\.ph$/i.test(email.trim())
  const valid = emailOk && studentNo.trim() && isPin(pin) && pin === pin2
  return (
    <form
      className="flex flex-1 flex-col gap-4 py-5"
      onSubmit={(e) => {
        e.preventDefault()
        if (valid) onSubmit({ email: email.trim().toLowerCase(), studentNo: studentNo.trim(), name: name.trim(), pin })
      }}
    >
      <p className="text-body-m text-on-surface-variant">
        ID …{tap.uid.slice(-6).toUpperCase()}{tap.virtual ? ' (demo)' : ''} has no wallet yet. One ID per email.
      </p>
      <TextField id="email" label="UMak email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jdelacruz@umak.edu.ph" />
      {email && !emailOk && <p className="-mt-2 text-body-s text-error">Use your @umak.edu.ph email.</p>}
      <TextField id="student-no" label="Student number" mono value={studentNo} onChange={(e) => setStudentNo(e.target.value)} />
      <TextField id="name" label="Name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
      <TextField id="pin" label="PIN for paying (6 digits)" mono inputMode="numeric" type="password" maxLength={6} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} />
      <TextField id="pin2" label="PIN again" mono inputMode="numeric" type="password" maxLength={6} value={pin2} onChange={(e) => setPin2(e.target.value.replace(/\D/g, ''))} />
      {pin2 && pin !== pin2 && <p className="-mt-2 text-body-s text-error">The PINs don't match.</p>}
      <div className="mt-auto mb-4">
        <Button size="l" full type="submit" icon="verified" disabled={!valid}>Register ID</Button>
      </div>
    </form>
  )
}

function MeDashboard({ me }: { me: MeLogin }) {
  const { online, history, historyError, reload } = useMe()
  useEffect(() => {
    void reload()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const recent = history?.receipts.slice(0, 5) ?? []
  return (
    <AppColumn rail>
      <TopBar title={`Hi, ${firstName(me.name)}`} back="/app" actions={<NetChip online={online} />} />
      <div className="px-4 pt-4">
        <Card>
          <p className="text-label-l text-on-surface-variant">Balance</p>
          <p className="font-display text-display-m font-semibold tabular-nums">{history?.balance != null ? pesos(history.balance) : '—'}</p>
          <p className="mt-1 font-mono text-body-m text-on-surface-variant">
            {history ? `${pesos(history.pendingTotal)} pending settlement` : historyError ? 'Offline: balance shows when you have signal' : 'Loading…'}
          </p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <Button variant="tonal" icon="add_card" to="/me/topup">Top up</Button>
            <Button variant="outlined" icon="sync" to="/me/refresh">Settle</Button>
          </div>
        </Card>
      </div>
      <div className="flex-1 pb-28 pt-4">
        <div className="flex items-center justify-between px-4 pb-1">
          <h2 className="font-display text-title-s font-semibold text-on-surface-variant">Recent</h2>
        </div>
        {recent.length === 0 ? (
          <div className="px-4">
            <EmptyState icon="receipt_long" title="No payments yet">Tap your ID at a stall to pay. Payments show here.</EmptyState>
          </div>
        ) : (
          <div className="divide-y divide-outline-variant">
            {recent.map((r) => <PaymentRow key={r.id} r={r} />)}
          </div>
        )}
      </div>
      <div className="pointer-events-none sticky bottom-24 z-30 -mt-14 flex justify-end px-4 medium:bottom-6">
        <Fab icon="contactless" to="/me/refresh">Tap ID</Fab>
      </div>
      <NavBar items={NAV} active="/me" />
    </AppColumn>
  )
}

function PaymentRow({ r }: { r: HistoryItem }) {
  const body = (
    <>
      <Avatar icon="storefront" tone={r.status === 'settled' ? 'secondary' : r.status === 'pending' ? 'tertiary' : 'error'} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-body-l text-on-surface">{r.merchant ?? short(r.to)}</span>
        <span className="block truncate text-body-m text-on-surface-variant">{when(r.createdAt)}{r.reason ? `, ${r.reason}` : ''}</span>
      </span>
      <span className="flex flex-col items-end gap-1">
        <span className="text-title-m font-semibold tabular-nums">−{pesos(r.amount)}</span>
        <StatusChip status={r.status} />
      </span>
    </>
  )
  const cls = 'sl relative flex w-full min-h-[72px] items-center gap-4 px-4 py-2 text-left'
  return r.txHash ? (
    <a className={cls} href={r.explorer ?? txUrl(r.txHash)} target="_blank" rel="noreferrer">{body}</a>
  ) : (
    <div className={cls}>{body}</div>
  )
}

/* ---------- Tap to settle (refresh) ---------- */

type FlowView =
  | { kind: 'tap' }
  | { kind: 'busy'; text: string }
  | { kind: 'write'; tap: CardTap; card: Hex; done: { title: string; text: string; balance: number; txHash?: string } }
  | { kind: 'done'; title: string; text: string; balance: number; txHash?: string }
  | { kind: 'error'; message: string }

function useFlow() {
  const [view, setView] = useState<FlowView>({ kind: 'tap' })
  return [view, setView] as const
}

function FlowFrame({ title, view, children, reset }: { title: string; view: FlowView; children: ReactNode; reset: () => void }) {
  const { online, card, reload } = useMe()
  const navigate = useNavigate()
  return (
    <AppColumn>
      <TopBar title={title} back="/me" actions={<NetChip online={online} />} />
      <div className="flex flex-1 flex-col px-4">
        {view.kind === 'tap' && children}
        {view.kind === 'busy' && <Busy>{view.text}</Busy>}
        {view.kind === 'write' && <CardWriter tap={view.tap} card={view.card} write={card.write} onDone={() => { void reload(); reset() }} />}
        {view.kind === 'done' && (
          <div className="flex flex-1 flex-col gap-5 py-8">
            <div className="flex flex-col items-center gap-3 text-center">
              <span className="grid h-20 w-20 place-items-center rounded-full bg-success-container text-on-success-container"><Icon name="check" size={44} /></span>
              <p className="font-display text-headline-s font-semibold">{view.title}</p>
              <p className="max-w-[34ch] text-body-l text-on-surface-variant">{view.text}</p>
            </div>
            <Card>
              <div className="flex items-center justify-between">
                <span className="text-body-l text-on-surface-variant">Balance on your ID</span>
                <span className="text-title-l font-semibold tabular-nums">{pesos(view.balance)}</span>
              </div>
              {view.txHash && (
                <a className="mt-2 block font-mono text-body-m text-primary underline" href={txUrl(view.txHash)} target="_blank" rel="noreferrer">
                  Transaction {short(view.txHash)}
                </a>
              )}
            </Card>
            <div className="mt-auto mb-4"><Button size="l" full onClick={() => navigate('/me')}>Done</Button></div>
          </div>
        )}
        {view.kind === 'error' && <Failed message={view.message} onBack={reset} />}
      </div>
    </AppColumn>
  )
}

export function MeRefresh() {
  const { me } = useMe()
  const [view, setView] = useFlow()
  const onTap = async (tap: CardTap) => {
    if (me && tap.uidHash !== me.uidHash) return setView({ kind: 'error', message: 'That is not the ID registered on this phone.' })
    if (!tap.card) return setView({ kind: 'error', message: errorText(new Error('CARD_NOT_LINKED')) })
    setView({ kind: 'busy', text: `Settling on ${NETWORK}…` })
    try {
      const res = await api.refresh({ uid: tap.uid, card: tap.card })
      setView({ kind: 'write', tap, card: res.card, done: { title: 'ID up to date', text: settledText(res.settled), balance: res.balance } })
    } catch (e) {
      setView({ kind: 'error', message: errorText(e) })
    }
  }
  return (
    <WriteThenDone view={view} setView={setView} title="Settle payments">
      <TapStep title="Tap your ID" hint="Settles a payment waiting on your ID and loads your latest balance onto it." onTap={(t) => void onTap(t)} />
    </WriteThenDone>
  )
}

/** Shows the flow; after the card write it switches to the Done view with the stored summary. */
function WriteThenDone({ view, setView, title, children }: { view: FlowView; setView: (v: FlowView) => void; title: string; children: ReactNode }) {
  const pendingDone = view.kind === 'write' ? view.done : null
  return (
    <FlowFrame title={title} view={view} reset={() => setView(pendingDone ? { kind: 'done', ...pendingDone } : { kind: 'tap' })}>
      {children}
    </FlowFrame>
  )
}

/* ---------- Top up (online, simulated payment) ---------- */

export function MeTopUp() {
  const { me } = useMe()
  const [view, setView] = useFlow()
  const [amount, setAmount] = useState(20000)

  const onTap = async (tap: CardTap) => {
    if (me && tap.uidHash !== me.uidHash) return setView({ kind: 'error', message: 'That is not the ID registered on this phone.' })
    if (!tap.card) return setView({ kind: 'error', message: errorText(new Error('CARD_NOT_LINKED')) })
    let card: Hex = tap.card
    try {
      // A top-up needs a clear, current card. Settle first if a payment is on it.
      if (decodeCard(card)?.pending) {
        setView({ kind: 'busy', text: 'Settling the pending payment first…' })
        card = (await api.refresh({ uid: tap.uid, card })).card
      }
      setView({ kind: 'busy', text: `Paying ${pesos(amount)} (simulated) and minting tPHP…` })
      let res
      try {
        res = await api.topUp({ uid: tap.uid, card, amount })
      } catch (e) {
        if (!(e instanceof ApiError && (e.message === 'CARD_STALE' || e.message === 'CARD_PENDING'))) throw e
        card = (await api.refresh({ uid: tap.uid, card })).card
        res = await api.topUp({ uid: tap.uid, card, amount })
      }
      setView({ kind: 'write', tap, card: res.card, done: { title: `Topped up ${pesos(amount)}`, text: `Minted on ${NETWORK}. Ref ${res.ref}.`, balance: res.balance, txHash: res.txHash } })
    } catch (e) {
      // If a refresh already issued a new record, still save it to the card.
      if (card !== tap.card) return setView({ kind: 'write', tap, card, done: { title: 'Top-up failed', text: errorText(e), balance: decodeCard(card)?.state.balance ?? 0 } })
      setView({ kind: 'error', message: errorText(e) })
    }
  }

  return (
    <WriteThenDone view={view} setView={setView} title="Top up">
      <div className="pt-5">
        <p className="text-label-l text-on-surface-variant">Amount</p>
        <p className="font-display text-display-m font-semibold tabular-nums">{pesos(amount)}</p>
        <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Amount">
          {TOP_UPS.map((a) => (
            <Chip key={a} selected={a === amount} onClick={() => setAmount(a)}>{pesos(a).replace('.00', '')}</Chip>
          ))}
        </div>
        <p className="mt-3 text-body-s text-on-surface-variant">Simulated GCash payment: test tPHP is minted to your ID's wallet. No real money moves.</p>
      </div>
      <TapStep title="Tap your ID to pay" hint="The new balance is written to your ID, so stalls can accept it offline." onTap={(t) => void onTap(t)} />
    </WriteThenDone>
  )
}

/* ---------- Activity ---------- */

type Filter = 'all' | 'pending' | 'settled' | 'failed'

export function MeActivity() {
  const { online, history, reload } = useMe()
  const [filter, setFilter] = useState<Filter>('all')
  useEffect(() => {
    void reload()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const rows = (history?.receipts ?? []).filter((r) =>
    filter === 'all' ? true : filter === 'failed' ? r.status === 'failed' || r.status === 'rejected' : r.status === filter,
  )
  return (
    <AppColumn rail>
      <TopBar title="Activity" actions={<NetChip online={online} />} />
      <div className="flex flex-1 flex-col gap-4 px-4 py-4">
        <div className="flex gap-2 overflow-x-auto" role="group" aria-label="Filter">
          {(['all', 'pending', 'settled', 'failed'] as Filter[]).map((f) => (
            <Chip key={f} selected={filter === f} onClick={() => setFilter(f)}>{f[0].toUpperCase() + f.slice(1)}</Chip>
          ))}
        </div>
        {rows.length === 0 ? (
          <EmptyState icon="receipt_long" title="Nothing here">{history ? 'No payments match this filter.' : 'Connect to load your payments.'}</EmptyState>
        ) : (
          <div className="-mx-4 divide-y divide-outline-variant">{rows.map((r) => <PaymentRow key={r.id} r={r} />)}</div>
        )}
      </div>
      <NavBar items={NAV} active="/me/activity" />
    </AppColumn>
  )
}

/* ---------- Profile ---------- */

export function MeProfile() {
  const { online, me, logout } = useMe()
  const navigate = useNavigate()
  if (!me) return null
  return (
    <AppColumn rail>
      <TopBar title="Profile" actions={<NetChip online={online} />} />
      <div className="flex flex-1 flex-col gap-4 px-4 py-4">
        <Card>
          <p className="text-title-l font-semibold">{me.name}</p>
          <p className="font-mono text-body-m text-on-surface-variant">{me.studentNo}</p>
        </Card>
        <List>
          <ListItem
            lead={<Avatar icon="account_balance_wallet" />}
            headline="Your ID's wallet"
            support={<a className="font-mono text-primary underline" href={addressUrl(me.address)} target="_blank" rel="noreferrer">{short(me.address)}</a>}
          />
          <ListItem lead={<Avatar icon="lock" />} headline="Paying PIN" support="Set when you registered. See the cashier to reset it." />
          <ListItem lead={<Avatar icon="language" />} headline="Network" support={`${NETWORK}, simulated pesos (tPHP)`} />
        </List>
        <div className="mt-auto mb-4">
          <Button
            size="l"
            variant="outlined"
            full
            icon="logout"
            onClick={() => void logout().then(() => navigate('/me'))}
          >
            Log out of this phone
          </Button>
          <p className="mt-2 text-center text-body-s text-on-surface-variant">Your wallet stays on your ID. <Link className="underline" to="/app">Switch role</Link></p>
        </div>
      </div>
      <NavBar items={NAV} active="/me/profile" />
    </AppColumn>
  )
}

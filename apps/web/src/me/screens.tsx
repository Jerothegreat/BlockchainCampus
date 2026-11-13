// /me screens, 1:1 with SCR['me-*'] in docs/design/board.html (the look board artifact).
import { Html5Qrcode } from 'html5-qrcode'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router'
import { useT } from '../i18n'
import { api, txUrl } from '../lib/api'
import type { QueuedReceipt } from '../lib/db'
import { clock } from '../lib/hooks'
import { pesos } from '../lib/pay'
import {
  AppColumn, Avatar, Banner, Button, Card, Chip, EmptyState, Icon, IconButton, NavBar, NetChip, SampleTag, Snackbar,
  StatusChip, TextField, TopBar, type NavItem,
} from '../ui'
import { FabDock, LangToggle, LegalDialog, LegalLink, MoneyItem, RowButton, SnackDock, Wordmark, type LegalKey } from '../ui/more'
import { ReceiptSlip } from '../ui/ReceiptSlip'
import { useMe } from './state'

function useNav(): NavItem[] {
  const t = useT()
  return [
    { to: '/me', icon: 'home', label: t('home') },
    { to: '/me/activity', icon: 'receipt_long', label: t('activity') },
    { to: '/me/assistant', icon: 'smart_toy', label: t('assistant') },
    { to: '/me/profile', icon: 'account_circle', label: t('profile') },
  ]
}

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`
const firstName = (n: string) => n.split(' ')[0]

function when(t: number) {
  const d = new Date(t)
  const today = new Date().setHours(0, 0, 0, 0)
  const label = t >= today ? 'Today' : t >= today - 86_400_000 ? 'Yesterday' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return `${label} ${clock(t)}`
}

function Row({ r }: { r: QueuedReceipt }) {
  const credit = r.kind === 'topup'
  return (
    <MoneyItem
      to={`/me/receipt/${r.id}`}
      icon={credit ? 'add_card' : /drink|juice|café|cafe|coffee/i.test(`${r.merchantName} ${r.item ?? ''}`) ? 'local_cafe' : 'restaurant'}
      tone={credit ? 'success' : r.status === 'failed' ? 'error' : 'secondary'}
      title={r.merchantName}
      when={when(r.createdAt)}
      amount={`${credit ? '+' : '−'}${pesos(r.amount)}`}
      credit={credit}
      status={r.status}
    />
  )
}

/** Guard: /me screens need a login; the first run shows the intro. */
export function MeGate({ children }: { children: React.ReactNode }) {
  const m = useMe()
  if (!m.ready) return null
  if (!m.me) return <Navigate to={m.introSeen ? '/me/login' : '/me/intro'} replace />
  return <>{children}</>
}

function SnackHost() {
  const m = useMe()
  const navigate = useNavigate()
  const t = useT()
  useEffect(() => {
    if (!m.snack) return
    const id = setTimeout(m.dismissSnack, 6000)
    return () => clearTimeout(id)
  }, [m.snack]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!m.snack) return null
  const id = m.snack.id
  return (
    <SnackDock>
      <Snackbar
        icon="check_circle"
        action={
          <button type="button" onClick={() => { m.dismissSnack(); navigate(`/me/receipt/${id}`) }} className="h-10 rounded-full px-3 text-label-l font-bold text-inverse-primary">
            {t('view')}
          </button>
        }
      >
        {m.snack.text}
      </Snackbar>
    </SnackDock>
  )
}

/* ---------- Intro (first run) ---------- */

export function MeIntro() {
  const t = useT()
  const m = useMe()
  const navigate = useNavigate()
  const [page, setPage] = useState(0)
  const done = () => {
    m.seeIntro()
    navigate('/me/login')
  }
  const pages = [
    ['intro1t', 'intro1', 'badge'],
    ['intro2t', 'intro2', 'cloud_off'],
    ['intro3t', 'intro3', 'qr_code_scanner'],
  ] as const
  const [h, p, icon] = pages[page]
  return (
    <AppColumn>
      <div className="flex items-center justify-between px-2 pt-2">
        <LangToggle />
        <Button variant="text" onClick={done}>{t('skip')}</Button>
      </div>
      <div className="flex flex-1 flex-col gap-8 px-6 pb-4 pt-6">
        {page === 2 ? (
          <div className="mx-auto w-full max-w-[280px]">
            <ReceiptSlip merchant="Kuya's Grill" createdAt={Date.now()} rows={[{ label: 'Rice meal', value: '85.00' }, { label: 'Paid by', value: 'Juan D. …5E:80', muted: true }]} total={8500} id="7c1e9a40-55b2-4d1f" stamp={{ kind: 'pending' }} />
          </div>
        ) : (
          <div className="mx-auto grid h-48 w-48 place-items-center rounded-full bg-secondary-container text-on-secondary-container">
            <Icon name={icon} size={88} />
          </div>
        )}
        <div className="space-y-3">
          <h1 className="font-display text-headline-m font-semibold text-balance">{t(h)}</h1>
          <p className="max-w-[36ch] text-body-l text-on-surface-variant">{t(p)}</p>
        </div>
      </div>
      <div className="flex items-center justify-between gap-4 px-6 pb-6">
        <div className="flex gap-2" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <span key={i} className={`h-2 rounded-full ${i === page ? 'w-6 bg-primary' : 'w-2 bg-outline-variant'}`} />
          ))}
        </div>
        {page < 2 ? (
          <Button size="l" onClick={() => setPage(page + 1)}>{t('introNext')}</Button>
        ) : (
          <Button size="l" onClick={done}>{t('introStart')}</Button>
        )}
      </div>
    </AppColumn>
  )
}

/* ---------- Log in ---------- */

export function MeLogin() {
  const t = useT()
  const m = useMe()
  const navigate = useNavigate()
  const [no, setNo] = useState('')
  const [pin, setPin] = useState('')
  const [agree, setAgree] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (m.ready && m.me) return <Navigate to="/me" replace />

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      await m.login(no, pin)
      navigate('/me', { replace: true })
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <AppColumn>
      <TopBar title="" back="/me/intro" actions={<LangToggle />} />
      <form onSubmit={submit} className="flex flex-1 flex-col gap-4 px-4 py-4">
        <Wordmark />
        <h2 className="font-display text-headline-m font-semibold text-balance">{t('loginT')}</h2>
        <TextField id="lno" label={t('studentNo')} value={no} onChange={(e) => setNo(e.target.value)} autoComplete="username" required />
        <TextField id="lpin" label={t('pin')} type="password" inputMode="numeric" pattern="\d{4}" maxLength={4} value={pin} onChange={(e) => setPin(e.target.value)} autoComplete="current-password" required />
        <label className="flex items-start gap-3 py-1 text-body-m" htmlFor="consent-login">
          <input id="consent-login" type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} required className="mt-0.5 h-[18px] w-[18px] shrink-0 accent-[var(--primary)]" />
          <span>
            {t('consentLogin')} <LegalLink which="privacy">{t('privacy')}</LegalLink>
          </span>
        </label>
        {error && <p role="alert" className="text-body-m text-error">{error}</p>}
        <div className="mt-auto mb-4 space-y-2">
          <Button size="l" full type="submit" disabled={busy || !agree}>{t('login')}</Button>
          <p className="text-center text-body-s text-on-surface-variant">{t('loginHint')}</p>
        </div>
      </form>
    </AppColumn>
  )
}

/* ---------- Home ---------- */

export function MeHome() {
  const t = useT()
  const m = useMe()
  const nav = useNav()
  const me = m.me!
  return (
    <AppColumn rail>
      <TopBar title={`Hi, ${firstName(me.name)}`} actions={<NetChip online={m.online} />} />
      <div className="px-4 pt-4">
        <Card>
          <p className="text-label-l text-on-surface-variant">{t('available')}</p>
          <p className="font-display text-display-m font-semibold tabular-nums">{pesos(Math.max(0, me.balance - m.pending))}</p>
          <p className="mt-1 font-mono text-body-m text-on-surface-variant">
            {pesos(me.balance)} {t('onChain')}, {pesos(m.pending)} {t('pendingW')}
          </p>
        </Card>
      </div>
      <div className="flex-1 pb-28 pt-4">
        <div className="flex items-center justify-between px-4 pb-1">
          <h2 className="font-display text-title-s font-semibold text-on-surface-variant">{t('recent')}</h2>
          {me.sample && <SampleTag />}
        </div>
        {m.receipts.length === 0 ? (
          <div className="px-4">
            <EmptyState icon="receipt_long" title="No payments yet">After you pay at a stall, scan the receipt QR.</EmptyState>
          </div>
        ) : (
          <div className="divide-y divide-outline-variant">
            {m.receipts.slice(0, 5).map((r) => <Row key={r.id} r={r} />)}
          </div>
        )}
      </div>
      <SnackHost />
      <FabDock>
        <FabLink />
      </FabDock>
      <NavBar items={nav} active="/me" />
    </AppColumn>
  )
}

function FabLink() {
  const t = useT()
  const navigate = useNavigate()
  return (
    <button type="button" onClick={() => navigate('/me/scan')} className="sl relative pointer-events-auto flex h-14 items-center gap-3 rounded-[16px] bg-cta pl-4 pr-5 text-label-l font-bold text-on-cta shadow-3">
      <Icon name="qr_code_scanner" />
      {t('scanReceipt')}
    </button>
  )
}

/* ---------- Scan ---------- */

export function MeScan() {
  const t = useT()
  const m = useMe()
  const navigate = useNavigate()
  const [camError, setCamError] = useState<string | null>(null)
  const [bad, setBad] = useState(false)
  const handled = useRef(false)

  useEffect(() => {
    const scanner = new Html5Qrcode('qr-reader', { verbose: false })
    let started = false
    scanner
      .start(
        { facingMode: 'environment' },
        // Scan box = the drawn frame (inset 18%), never below the library's 50 px minimum.
        { fps: 10, qrbox: (w, h) => { const s = Math.max(50, Math.floor(Math.min(w, h) * 0.64)); return { width: s, height: s } } },
        async (text) => {
          if (handled.current) return
          const id = await m.addScanned(text)
          if (!id) return setBad(true)
          handled.current = true
          navigate(`/me/receipt/${id}`, { replace: true })
        },
        () => {},
      )
      .then(() => (started = true))
      .catch((e: unknown) => setCamError(String(e)))
    return () => {
      if (started) void scanner.stop().then(() => scanner.clear()).catch(() => {})
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <AppColumn>
      <TopBar title={t('scanReceipt')} back="/me" actions={<NetChip online={m.online} />} />
      <div className="flex flex-1 flex-col gap-5 px-4 py-6">
        <div className="relative aspect-square w-full overflow-hidden rounded-[12px] bg-surface-container-highest">
          <div id="qr-reader" className="absolute inset-0 [&_video]:h-full [&_video]:w-full [&_video]:object-cover" />
          {camError && <div className="absolute inset-0 grid place-items-center p-6 text-center text-body-m text-on-surface-variant">Camera view. Allow the camera, or use the button below.</div>}
          <div className="pointer-events-none absolute inset-[18%] rounded-[16px] border-[3px] border-primary" />
          <span className="scan-bar pointer-events-none absolute inset-x-[18%] h-0.5 bg-primary" />
        </div>
        <p className="text-center text-body-l text-on-surface-variant">{t('camera')}</p>
        {bad && <p role="alert" className="text-center text-body-m text-error">That QR is not a HeronPay receipt.</p>}
        <div className="mt-auto mb-4">
          <Button size="l" full onClick={() => void m.simulateScan().then((id) => navigate(`/me/receipt/${id}`, { replace: true }))}>
            {t('simScan')}
          </Button>
        </div>
      </div>
    </AppColumn>
  )
}

/* ---------- Receipt (Pending, then Settled with snackbar) ---------- */

export function MeReceipt() {
  const t = useT()
  const m = useMe()
  const nav = useNav()
  const { id = '' } = useParams()
  const [error, setError] = useState<string | null>(null)
  const r = m.receipts.find((x) => x.id === id)
  if (!r) return m.receipts.length ? <Navigate to="/me/activity" replace /> : null

  const settled = r.status === 'settled'
  const topup = r.kind === 'topup'
  return (
    <AppColumn rail>
      <TopBar title={t('receiptT')} back="/me/activity" actions={<NetChip online={m.online} />} />
      <div className="flex flex-1 flex-col gap-4 px-4 py-5 pb-28">
        <ReceiptSlip
          merchant={r.merchantName}
          createdAt={r.createdAt}
          rows={[
            { label: topup ? 'Top-up' : (r.item ?? 'Sale'), value: (r.amount / 100).toFixed(2) },
            { label: topup ? 'To' : 'Paid by', value: r.studentName, muted: true },
          ]}
          total={r.amount}
          id={r.id}
          stamp={r.status === 'failed' ? undefined : settled ? { kind: 'settled', block: r.blockNumber } : { kind: 'pending' }}
        />
        <div className="flex justify-center"><StatusChip status={r.status} /></div>
        {r.status === 'failed' && (
          <Banner tone="error" icon="cancel" title="Failed: not enough balance at settlement">
            Another stall used the same pesos first. Nothing was taken from you for this receipt.
          </Banner>
        )}
        <dl className="grid grid-cols-[96px_minmax(0,1fr)] gap-x-3 gap-y-2 text-body-m">
          <dt className="text-on-surface-variant">Receipt id</dt>
          <dd className="break-all font-mono">{r.id.slice(0, 18)}</dd>
          <dt className="text-on-surface-variant">From</dt>
          <dd className="break-all font-mono">{short(r.from)}{topup ? ', cashier' : ' (you)'}</dd>
          <dt className="text-on-surface-variant">To</dt>
          <dd className="break-all font-mono">{short(r.to)}{topup ? ' (you)' : `, ${r.merchantName}`}</dd>
          {settled && r.txHash && (
            <>
              <dt className="text-on-surface-variant">Transaction</dt>
              <dd className="break-all font-mono">{`${r.txHash.slice(0, 8)}…${r.txHash.slice(-4)}`}</dd>
            </>
          )}
        </dl>
        {settled ? (
          <>
            <p className="text-body-m text-on-surface-variant">{t('settledNote')}</p>
            {r.txHash && (
              <a href={txUrl(r.txHash)} target="_blank" rel="noopener" className="sl relative inline-flex h-14 w-full items-center justify-center gap-2 rounded-full border border-outline text-title-m font-semibold text-primary">
                {t('viewExplorer')} <Icon name="open_in_new" size={20} />
              </a>
            )}
          </>
        ) : r.status === 'pending' ? (
          <>
            <p className="text-body-m text-on-surface-variant">{t('waitingSignal')}</p>
            <Button size="l" full icon="cloud_done" onClick={() => void m.settleNow(r.id).catch((e: Error) => setError(e.message))}>
              {t('simOnline')}
            </Button>
            {error && <p role="alert" className="text-body-m text-error">{error}</p>}
          </>
        ) : null}
        {m.me?.sample && (
          <p className="text-body-s text-on-surface-variant">
            <SampleTag /> Addresses and transaction are samples until the contract is deployed.
          </p>
        )}
      </div>
      <SnackHost />
      <NavBar items={nav} active="/me/activity" />
    </AppColumn>
  )
}

/* ---------- Activity ---------- */

type Filter = 'all' | 'pending' | 'settled' | 'failed'

export function MeActivity() {
  const t = useT()
  const m = useMe()
  const nav = useNav()
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState<string | null>(null)
  const rows = m.receipts
    .filter((r) => filter === 'all' || r.status === filter)
    .filter((r) => !query || r.merchantName.toLowerCase().includes(query.toLowerCase()))
  const month = new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
  return (
    <AppColumn rail>
      <TopBar title={t('activity')} actions={<IconButton icon={query === null ? 'search' : 'close'} label={query === null ? 'Search' : 'Close search'} onClick={() => setQuery(query === null ? '' : null)} />} />
      {query !== null && (
        <div className="px-4 pt-2">
          <TextField id="q" label="Search stalls" value={query} onChange={(e) => setQuery(e.target.value)} autoFocus />
        </div>
      )}
      <div className="flex gap-2 overflow-x-auto px-4 py-3" role="group" aria-label="Filter">
        {(['all', 'pending', 'settled', 'failed'] as const).map((k) => (
          <Chip key={k} selected={filter === k} onClick={() => setFilter(k)}>{t(k)}</Chip>
        ))}
      </div>
      <div className="flex items-center justify-between px-4 pb-1">
        <h2 className="font-display text-title-s font-semibold text-on-surface-variant">{month}</h2>
        {m.me?.sample && <SampleTag />}
      </div>
      <div className="flex-1 divide-y divide-outline-variant pb-28">
        {rows.length === 0 ? (
          <div className="px-4 pt-2">
            <EmptyState icon="receipt_long" title="No payments yet">After you pay at a stall, scan the receipt QR.</EmptyState>
          </div>
        ) : (
          rows.map((r) => <Row key={r.id} r={r} />)
        )}
      </div>
      <SnackHost />
      <FabDock>
        <FabLink />
      </FabDock>
      <NavBar items={nav} active="/me/activity" />
    </AppColumn>
  )
}

/* ---------- Assistant ---------- */

type Msg = { q: string; a: string; tip?: string }

/** Offline answers built only from the receipts on this phone (same rule as the API assistant). */
function localAnswer(q: string, rows: QueuedReceipt[], available: number): string | null {
  const pay = rows.filter((r) => r.kind !== 'topup' && r.status !== 'failed')
  const since = (ms: number) => pay.filter((r) => r.createdAt >= ms)
  const sum = (rs: QueuedReceipt[]) => rs.reduce((s, r) => s + r.amount, 0)
  const today = new Date().setHours(0, 0, 0, 0)
  const ql = q.toLowerCase()
  if (ql.includes('today') || ql.includes('ngayon')) {
    const rs = since(today)
    if (!rs.length) return 'You have not spent anything today.'
    const stalls = [...new Set(rs.map((r) => r.merchantName))]
    const pend = rs.filter((r) => r.status === 'pending').length
    return `You spent ${pesos(sum(rs))} today at ${stalls.join(', ')}.${pend ? ` ${pend} of those ${pend === 1 ? 'payment is' : 'payments are'} still pending.` : ''} You have ${pesos(available)} left.`
  }
  if (ql.includes('week')) {
    const rs = since(Date.now() - 7 * 86_400_000)
    return rs.length ? `You spent ${pesos(sum(rs))} on food and drinks this week, over ${rs.length} ${rs.length === 1 ? 'payment' : 'payments'}.` : 'No payments this week.'
  }
  if (ql.includes('biggest')) {
    const top = [...pay].sort((a, b) => b.amount - a.amount)[0]
    return top ? `Your biggest expense was ${pesos(top.amount)} at ${top.merchantName} on ${when(top.createdAt)}.` : 'No payments yet.'
  }
  return null
}

export function MeAssistant() {
  const t = useT()
  const m = useMe()
  const nav = useNav()
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [text, setText] = useState('')
  const [needsSignal, setNeedsSignal] = useState(false)
  const [busy, setBusy] = useState(false)
  const available = Math.max(0, (m.me?.balance ?? 0) - m.pending)

  const ask = async (q: string) => {
    if (!q.trim() || busy) return
    setText('')
    setNeedsSignal(false)
    setBusy(true)
    try {
      const r = await api.assistant({ studentNo: m.me!.studentNo, question: q })
      setMsgs((x) => [...x, { q, a: r.answer, tip: r.tip }])
    } catch {
      const a = localAnswer(q, m.receipts, available)
      if (a) setMsgs((x) => [...x, { q, a }])
      else setNeedsSignal(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <AppColumn rail>
      <TopBar title={t('assistant')} actions={<NetChip online={m.online} />} />
      <div className="flex flex-1 flex-col gap-4 px-4 py-4">
        <p className="text-body-s text-on-surface-variant">
          {t('asNote')} <LegalLink which="privacy">{t('privacy')}</LegalLink>
        </p>
        <div className="flex flex-wrap gap-2">
          {[t('q1'), 'Food this week?', 'Biggest expense?'].map((q) => (
            <Chip key={q} onClick={() => void ask(q)}>{q}</Chip>
          ))}
        </div>
        <div className="flex flex-col gap-3" aria-live="polite">
          {msgs.map((x, i) => (
            <div key={i} className="flex flex-col gap-3">
              <p className="max-w-[85%] self-end rounded-[20px] rounded-br-[6px] bg-secondary-container px-4 py-2.5 text-body-l text-on-secondary-container">{x.q}</p>
              <div className="flex max-w-[92%] gap-3">
                <Avatar icon="smart_toy" tone="tertiary" />
                <p className="rounded-[20px] rounded-tl-[6px] bg-surface-container-high px-4 py-3 text-body-l">
                  {x.a}
                  {x.tip && <span className="mt-2 block text-body-m text-on-surface-variant">{x.tip}</span>}
                </p>
              </div>
            </div>
          ))}
        </div>
        {needsSignal && (
          <Banner tone="warning" icon="cloud_off" title="The assistant needs signal">
            Your receipts are saved. Ask again when you are online.
          </Banner>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void ask(text)
          }}
          className="mt-auto flex items-center gap-2 pb-2"
        >
          <label htmlFor="ask" className="sr-only">{t('ask')}</label>
          <input id="ask" value={text} onChange={(e) => setText(e.target.value)} maxLength={300} placeholder={t('ask')} className="h-14 min-w-0 flex-1 rounded-full bg-surface-container-highest px-5 text-body-l text-on-surface outline-none placeholder:text-on-surface-variant focus:ring-2 focus:ring-primary" />
          <button type="submit" aria-label="Send" disabled={busy} className="sl relative grid h-14 w-14 shrink-0 place-items-center rounded-full bg-cta text-on-cta">
            <Icon name="send" />
          </button>
        </form>
      </div>
      <NavBar items={nav} active="/me/assistant" />
    </AppColumn>
  )
}

/* ---------- Profile ---------- */

export function MeProfile() {
  const t = useT()
  const m = useMe()
  const nav = useNav()
  const navigate = useNavigate()
  const [legal, setLegal] = useState<LegalKey | null>(null)
  const me = m.me!
  const initials = me.name.split(' ').map((w) => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()
  return (
    <AppColumn rail>
      <TopBar title={t('profile')} />
      <div className="flex flex-1 flex-col pb-4">
        <div className="flex items-center gap-4 px-4 py-5">
          <span className="grid h-14 w-14 place-items-center rounded-full bg-secondary-container font-display text-title-l font-bold text-on-secondary-container">{initials}</span>
          <div>
            <p className="text-title-l font-semibold">{me.name}</p>
            <p className="font-mono text-body-m text-on-surface-variant">{me.studentNo}{me.sample ? ', ID …5E:80' : ''}</p>
          </div>
        </div>
        <div className="divide-y divide-outline-variant">
          <RowButton icon="language" title={t('language')} support="English, Filipino" trail={<LangToggle />} />
          <RowButton icon="password" title={t('changePin')} support="Needs signal. Ask the cashier for now." />
          <RowButton icon="speed" title={t('offlineCapMe')} support="₱200 at stalls with no signal, set by AI" />
          <RowButton icon="policy" title={t('privacy')} support="What we collect and why" chevron onClick={() => setLegal('privacy')} />
          <RowButton icon="folder_shared" title={t('dataReq')} support="See, correct or delete your data" chevron onClick={() => setLegal('data')} />
        </div>
        <div className="mt-6 px-4">
          <Button variant="outlined" full icon="logout" onClick={() => void m.logout().then(() => navigate('/me/login'))}>
            {t('logout')}
          </Button>
        </div>
        <p className="mt-3 px-4 text-body-s text-on-surface-variant">{t('testnet')}</p>
      </div>
      <NavBar items={nav} active="/me/profile" />
      {legal && <LegalDialog which={legal} onClose={() => setLegal(null)} />}
    </AppColumn>
  )
}

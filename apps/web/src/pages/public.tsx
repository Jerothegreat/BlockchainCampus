// Landing (/), role picker (/app) and ops panel (/ops): 1:1 with landing(), SCR.app and SCR.ops
// in docs/design/board.html (the look board artifact).
import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { useT } from '../i18n'
import { EXPLORER_URL, api, txUrl, type Ops, type ReceiptStatus } from '../lib/api'
import { setMeta } from '../lib/db'
import { clock, useOnline } from '../lib/hooks'
import { pesos } from '../lib/pay'
import { AppColumn, Avatar, Button, Card, Icon, NetChip, SampleTag, StatusChip, TopBar, type Status } from '../ui'
import { LangToggle, LegalLink, Wordmark } from '../ui/more'
import { ReceiptSlip } from '../ui/ReceiptSlip'

/** Load from the API; fall back to the board's sample data when it is unreachable. */
function useData<T>(load: () => Promise<T>, sample: T): { data: T; sample: boolean } {
  const [state, setState] = useState<{ data: T; sample: boolean }>({ data: sample, sample: true })
  useEffect(() => {
    let live = true
    const run = () => load().then((data) => live && setState({ data, sample: false })).catch(() => {})
    void run()
    const id = setInterval(run, 5000)
    return () => {
      live = false
      clearInterval(id)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  return state
}

/* ===================== /app ===================== */

export function RolePicker() {
  const t = useT()
  const online = useOnline()
  const roles = [
    ['/cashier', t('cashier'), t('cashierSub'), 'badge', 'cashier'],
    ['/pos', t('stall'), t('stallSub'), 'storefront', 'stall'],
    ['/me', t('student'), t('studentSub'), 'wallet', 'student'],
  ] as const
  return (
    <AppColumn>
      <TopBar title="HeronPay" actions={<LangToggle />} />
      <div className="flex flex-1 flex-col gap-4 px-4 py-6">
        <h2 className="font-display text-headline-s font-semibold">{t('who')}</h2>
        <div className="divide-y divide-outline-variant overflow-hidden rounded-[12px] bg-surface-container-low">
          {roles.map(([to, h, p, icon, role]) => (
            <Link key={to} to={to} onClick={() => void setMeta('role', role)} className="sl relative flex w-full min-h-[72px] items-center gap-4 px-4 py-2 text-left">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-[8px] bg-secondary-container text-on-secondary-container">
                <Icon name={icon} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-body-l text-on-surface">
                  <span className="font-display text-title-m font-semibold">{h}</span>
                </span>
                <span className="block truncate text-body-m text-on-surface-variant">{p}</span>
              </span>
              <span className="text-on-surface-variant"><Icon name="chevron_right" /></span>
            </Link>
          ))}
        </div>
        <div>
          <Button variant="text" icon="monitoring" to="/ops">{t('opsLink')}</Button>
        </div>
        <p className="mt-auto flex flex-wrap items-center gap-3 text-body-m text-on-surface-variant">
          <NetChip online={online} /> Polygon Amoy testnet. {t('remembered')}
        </p>
      </div>
    </AppColumn>
  )
}

/* ===================== /ops ===================== */

const SAMPLE_OPS: Ops = (() => {
  const at = (h: number, m: number, s = 0) => new Date().setHours(h, m, s, 0)
  const r = (id: string, t: number, amount: number, studentName: string, merchantName: string, status: ReceiptStatus['status'], txHash: string | null, failReason: string | null = null): ReceiptStatus => ({
    id, from: '0x0', to: '0x0', amount, createdAt: t, uidHash: '', merchantId: '', status, txHash, blockNumber: null, merchantName, studentName, failReason,
  } as ReceiptStatus)
  return {
    flags: [{ uidHash: '…5E:80', studentName: 'Juan D.', reason: "Kuya's Grill 10:41:07, then Ate's Drinks 10:41:51. 44 seconds apart.", at: at(10, 41, 51), capBefore: 20000, capAfter: 0 }],
    stalls: [
      { merchantId: 'm1', name: "Kuya's Grill", online: true, queue: 0, lastSync: at(10, 44) },
      { merchantId: 'm2', name: "Ate's Drinks", online: false, queue: 3, lastSync: at(10, 20) },
      { merchantId: 'm3', name: 'Siomai House', online: true, queue: 0, lastSync: at(10, 45) },
      { merchantId: 'm4', name: 'Library Café', online: false, queue: 1, lastSync: at(9, 58) },
    ],
    totals: { settled: 386000, pending: 0, failed: 1, count: 42 },
    receipts: [
      r('a', at(10, 46, 10), 8500, 'Juan D.', "Kuya's Grill", 'settled', null, 'second copy skipped'),
      r('b', at(10, 44, 52), 8500, 'Juan D.', "Kuya's Grill", 'settled', '0x41d0…77e2'),
      r('c', at(10, 41, 51), 8500, 'Juan D.', "Ate's Drinks", 'pending', null, 'clone suspect'),
      r('d', at(10, 30, 2), 4000, 'Ana R.', "Kuya's Grill", 'settled', '0x9c11…3af0'),
      r('e', at(10, 12, 40), 2500, 'Mark T.', "Ate's Drinks", 'failed', null, 'INSUFFICIENT'),
    ],
    caps: [
      { studentName: 'Juan D.', uidHash: '', offlineCap: 0, capReason: 'Flagged: two stalls 44 s apart' },
      { studentName: 'Ana R.', uidHash: '', offlineCap: 25000, capReason: 'Steady top-ups, no failed payments' },
      { studentName: 'Mark T.', uidHash: '', offlineCap: 12000, capReason: 'One failed payment this week' },
      { studentName: 'Liza M.', uidHash: '', offlineCap: 20000, capReason: 'New student, default limit' },
    ],
  }
})()

const time = (t: number) => new Date(t).toLocaleTimeString('en-GB')
const capTone = (cap: number, flagged: boolean) => (flagged || cap === 0 ? 'text-error' : cap > 20000 ? 'text-success' : cap < 20000 ? 'text-warning' : 'text-secondary')

export function OpsPanel() {
  const online = useOnline()
  const { data: o, sample } = useData(api.ops, SAMPLE_OPS)
  const flag = o.flags[0]
  const wrap = 'mx-auto w-full max-w-[1760px] px-4 medium:px-6 large:px-8'
  const flaggedNames = new Set(o.flags.map((f) => f.studentName))
  return (
    <div className="min-h-screen">
      <TopBar
        title="HeronPay Ops"
        actions={
          <>
            <span className="hidden text-body-m medium:inline">Polygon Amoy</span>
            <NetChip online={online && !sample} />
          </>
        }
      />
      <main className={`${wrap} grid gap-6 py-6 large:grid-cols-[380px_minmax(0,1fr)] xlarge:grid-cols-[440px_minmax(0,1fr)]`}>
        <section className="min-w-0 space-y-4">
          {flag ? (
            <div className="rounded-[12px] bg-error-container p-5 text-on-error-container">
              <div className="flex items-center gap-2">
                <Icon name="flag" fill />
                <h2 className="font-display text-title-l font-bold">Clone suspect</h2>
                {sample && <SampleTag />}
              </div>
              <p className="mt-2 font-mono text-body-m">ID {flag.uidHash.slice(0, 8)}, {flag.studentName}</p>
              <p className="mt-1 text-body-l">{flag.reason}</p>
              <p className="mt-3 font-display text-title-l font-semibold tabular-nums">
                Offline limit {pesos(flag.capBefore)} → {pesos(flag.capAfter)}
              </p>
            </div>
          ) : (
            <Card>
              <div className="flex items-center gap-2"><Icon name="verified" /><h2 className="font-display text-title-m font-semibold">No flags</h2></div>
              <p className="mt-1 text-body-m text-on-surface-variant">Clone and burst checks run after every settlement.</p>
            </Card>
          )}
          <Card>
            <div className="flex items-center justify-between">
              <h2 className="font-display text-title-m font-semibold">Stalls</h2>
              {sample && <SampleTag />}
            </div>
            <ul className="mt-3 divide-y divide-outline-variant">
              {o.stalls.map((s) => (
                <li key={s.merchantId} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="text-title-s font-semibold">{s.name}</p>
                    <p className="text-body-s text-on-surface-variant">
                      {s.lastSync ? `Last sync ${clock(s.lastSync)}` : 'Never synced'}
                      {s.queue ? `, ${s.queue} waiting` : ''}
                    </p>
                  </div>
                  <NetChip online={s.online} />
                </li>
              ))}
            </ul>
          </Card>
          <Card>
            <h2 className="font-display text-title-m font-semibold">Today</h2>
            <dl className="mt-3 grid grid-cols-3 gap-3">
              {[
                ['Settled', String(o.totals.count)],
                ['Pesos', pesos(o.totals.settled).replace('.00', '')],
                ['Failed', String(o.totals.failed)],
              ].map(([l, v]) => (
                <div key={l}>
                  <dt className="text-body-s text-on-surface-variant">{l}</dt>
                  <dd className="font-display text-headline-s font-semibold tabular-nums">{v}</dd>
                </div>
              ))}
            </dl>
          </Card>
        </section>
        <section className="min-w-0 space-y-4">
          <h2 className="font-display text-title-l font-semibold">Live receipts</h2>
          <div className="overflow-x-auto rounded-[12px] bg-surface-container-low">
            <table className="w-full min-w-[640px] text-left text-body-m">
              <thead className="text-label-l text-on-surface-variant">
                <tr>{['Time', 'Amount', 'Student', 'Stall', 'Status', 'Detail'].map((h) => <th key={h} className="px-4 py-3 font-semibold">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-outline-variant">
                {o.receipts.map((r) => {
                  const flagged = r.failReason === 'clone suspect' || (flaggedNames.has(r.studentName) && r.status === 'pending')
                  const status: Status = flagged ? 'flagged' : r.status
                  return (
                    <tr key={r.id}>
                      <td className="px-4 py-3 font-mono text-on-surface-variant">{time(r.createdAt)}</td>
                      <td className="px-4 py-3 font-semibold tabular-nums">{pesos(r.amount)}</td>
                      <td className="px-4 py-3">{r.studentName}</td>
                      <td className="px-4 py-3">{r.merchantName}</td>
                      <td className="px-4 py-3"><StatusChip status={status} /></td>
                      <td className="px-4 py-3 font-mono text-body-s text-on-surface-variant">
                        {r.txHash && !sample ? (
                          <a href={txUrl(r.txHash)} target="_blank" rel="noopener" className="text-primary underline-offset-4 hover:underline">{`${r.txHash.slice(0, 6)}…${r.txHash.slice(-4)}`}</a>
                        ) : (r.txHash ?? r.failReason ?? '')}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <h2 className="font-display text-title-l font-semibold">Offline limits set by AI</h2>
          <ul className="grid gap-3 expanded:grid-cols-2">
            {o.caps.map((c) => (
              <li key={c.studentName + c.uidHash} className="flex items-center justify-between gap-4 rounded-[12px] bg-surface-container-low p-4">
                <div className="min-w-0">
                  <p className="text-title-s font-semibold">{c.studentName}</p>
                  <p className="text-body-m text-on-surface-variant">{c.capReason}</p>
                </div>
                <p className={`font-display text-headline-s font-semibold tabular-nums ${capTone(c.offlineCap, flaggedNames.has(c.studentName))}`}>
                  {pesos(c.offlineCap).replace('.00', '')}
                </p>
              </li>
            ))}
          </ul>
        </section>
      </main>
    </div>
  )
}

/* ===================== / (landing) ===================== */

const SAMPLE_FEED = [
  ['10:44:52', 8500, "Juan D. → Kuya's Grill", '0x41d0…77e2'],
  ['10:30:02', 4000, "Ana R. → Kuya's Grill", '0x9c11…3af0'],
  ['09:58:13', 50000, 'Cashier → Juan D. (top-up)', '0x8f2c…91ab'],
  ['09:50:40', 8500, "Liza M. → Ate's Drinks", '0x2b7e…d014'],
] as const

function DemoStage() {
  const t = useT()
  const [step, setStep] = useState(0)
  const steps = [
    ['demoTap', 'demo0', 'contactless'],
    ['demoPin', 'demo1', 'password'],
    ['demoOnline', 'demo2', 'cloud_done'],
    ['demoAgain', 'demo3', 'undo'],
  ] as const
  const slipProps = { merchant: "Kuya's Grill", createdAt: new Date().setHours(10, 41, 0, 0), rows: [{ label: 'Rice meal', value: '85.00' }, { label: 'Paid by', value: 'Juan D. …5E:80', muted: true }], total: 8500, id: '7c1e9a40-55b2-4d1f' }
  return (
    <div className="demo space-y-5 rounded-[12px] bg-surface-container p-5 medium:p-8" aria-live="polite">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-title-l font-semibold">{t('tryIt')}</h2>
        <NetChip online={step === 3} />
      </div>
      <div className="flex items-center gap-2" aria-hidden="true">
        {[0, 1, 2, 3].map((i) => <span key={i} className={`h-1.5 flex-1 rounded-full ${i <= step ? 'bg-primary' : 'bg-surface-container-highest'}`} />)}
      </div>
      {step === 0 && (
        <div className="grid min-h-[340px] place-items-center">
          <div className="flex flex-col items-center gap-5 py-2 text-center">
            <div className="relative grid h-44 w-44 place-items-center rounded-full bg-surface-container-high text-primary">
              <span className="nfc-ring absolute inset-0 rounded-full border-2 border-primary" />
              <Icon name="contactless" size={72} />
            </div>
            <p className="font-display text-headline-s font-semibold">{t('tapId')}</p>
          </div>
        </div>
      )}
      {step === 1 && (
        <div className="grid min-h-[340px] place-items-center gap-4">
          <p className="font-display text-headline-s">{pesos(8500)} to Kuya's Grill</p>
          <div className="flex gap-2" aria-hidden="true">{[0, 1, 2, 3].map((i) => <span key={i} className="h-3 w-3 rounded-full bg-on-surface" />)}</div>
        </div>
      )}
      {step === 2 && <div className="mx-auto max-w-[320px]"><ReceiptSlip {...slipProps} stamp={{ kind: 'pending' }} /></div>}
      {step === 3 && <div className="mx-auto max-w-[320px]"><ReceiptSlip {...slipProps} stamp={{ kind: 'settled', block: 52418903 }} /></div>}
      <div className="space-y-4">
        <p className="text-body-l text-on-surface-variant">{t(steps[step][1])}</p>
        <Button size="l" icon={steps[step][2]} onClick={() => setStep((step + 1) % 4)}>{t(steps[step][0])}</Button>
      </div>
      <p className="text-body-s text-on-surface-variant">Demo with sample data. No network calls.</p>
    </div>
  )
}

function Footer({ wrap }: { wrap: string }) {
  const t = useT()
  const a = 'underline-offset-4 hover:underline'
  const col = (h: string, items: React.ReactNode[]) => (
    <div className="min-w-0">
      <h3 className="mb-3 font-display text-title-s font-semibold text-on-surface">{h}</h3>
      <ul className="space-y-2 text-body-m text-on-surface-variant">{items.map((x, i) => <li key={i}>{x}</li>)}</ul>
    </div>
  )
  return (
    <footer className="border-t border-outline-variant bg-surface-container-low">
      <div className={`${wrap} py-12 xlarge:py-16`}>
        <div className="grid grid-cols-2 gap-8 expanded:grid-cols-4">
          <div className="col-span-2 space-y-3 expanded:col-span-1">
            <Wordmark size="title" />
            <p className="max-w-[34ch] text-body-m text-on-surface-variant">Campus payments with the UMak ID you already carry. Built for a 24-hour hackathon.</p>
          </div>
          {col('Product', [
            <Link to="/app" className={a}>{t('openApp')}</Link>,
            <a href="#how" className={a}>{t('howItWorks')}</a>,
            <a href="#proof" className={a}>{t('proof')}</a>,
            <Link to="/ops" className={a}>Ops panel</Link>,
          ])}
          {col('Team', [<LegalLink which="team" className={a}>About the team</LegalLink>, <>Contact: <span className="select-all">team email (placeholder)</span></>])}
          {col('Legal', [
            <LegalLink which="privacy" className={a}>Privacy notice</LegalLink>,
            <LegalLink which="terms" className={a}>Terms of use</LegalLink>,
            <LegalLink which="data" className={a}>Data requests</LegalLink>,
            <LegalLink which="cookies" className={a}>Cookies: essential only</LegalLink>,
            <LegalLink which="disclaimer" className={a}>Disclaimer</LegalLink>,
          ])}
        </div>
        <div className="mt-10 flex flex-col gap-2 border-t border-outline-variant pt-6 text-body-s text-on-surface-variant expanded:flex-row expanded:justify-between">
          <p>{t('testnet')}</p>
          <p>No cookie banner: the app keeps only what it needs to work offline.</p>
          <p>© 2026 HeronPay hackathon team</p>
        </div>
      </div>
    </footer>
  )
}

export function Landing() {
  const t = useT()
  const { data: feed, sample } = useData<ReceiptStatus[] | null>(() => api.settlements(4), null)
  const wrap = 'mx-auto w-full max-w-[1200px] xlarge:max-w-[1440px] px-4 medium:px-6 large:px-8 xlarge:px-10'
  const sec = 'py-14 medium:py-[72px] large:py-24 xlarge:py-28'
  const h2 = 'font-display text-headline-m font-semibold large:text-headline-l text-balance'
  const rows = !sample && feed?.length
    ? feed.map((r) => [time(r.createdAt), r.amount, `${r.studentName} → ${r.merchantName}`, r.txHash ?? ''] as const)
    : SAMPLE_FEED
  const steps = [[t('s1t'), t('s1')], [t('s2t'), t('s2')], [t('s3t'), t('s3')]]
  const ai = [[t('ai1t'), t('ai1'), 'tune'], [t('ai2t'), t('ai2'), 'flag'], [t('ai3t'), t('ai3'), 'smart_toy']]
  const limits = [[t('l1'), t('l1a')], [t('l2'), t('l2a')], [t('l3'), t('l3a')], [t('l4'), t('l4a')]]
  const road = [[t('r1t'), t('r1'), 'bluetooth'], [t('r2t'), t('r2'), 'shield'], [t('r3t'), t('r3'), 'school']]
  return (
    <>
      <header className="sticky top-0 z-30 border-b border-outline-variant bg-surface">
        <div className={wrap}>
          <div className="flex h-16 items-center justify-between gap-4">
            <Wordmark size="title" />
            <nav className="hidden items-center gap-6 text-label-l font-semibold expanded:flex">
              <a href="#how">{t('howItWorks')}</a>
              <a href="#proof">{t('proof')}</a>
              <a href="#safety">{t('aiSafety')}</a>
              <a href="#roadmap">{t('roadmap')}</a>
            </nav>
            <div className="flex items-center gap-2">
              <LangToggle />
              <Button to="/app">{t('openApp')}</Button>
            </div>
          </div>
        </div>
      </header>
      <main>
        <section className={`${wrap} ${sec} grid items-center gap-10 large:grid-cols-[minmax(0,1fr)_560px] xlarge:grid-cols-[minmax(0,1fr)_640px]`}>
          <div className="min-w-0 space-y-6">
            <h1 className="font-display font-bold leading-[1.04] tracking-[-0.03em] text-balance text-[2.75rem] medium:text-[4rem] large:text-[4.5rem] xlarge:text-[5.5rem]">{t('h1')}</h1>
            <p className="max-w-[52ch] text-body-l text-on-surface-variant large:text-[1.125rem] large:leading-7">{t('heroSub')}</p>
            <div className="flex flex-wrap items-center gap-3">
              <Button size="l" to="/app">{t('openApp')}</Button>
              <a href={EXPLORER_URL} target="_blank" rel="noopener" className="inline-flex h-14 items-center gap-2 px-3 text-label-l font-semibold text-primary">
                {t('viewExplorer')} <Icon name="open_in_new" size={18} />
              </a>
            </div>
          </div>
          <DemoStage />
        </section>
        <section id="how" className="border-y border-outline-variant bg-surface-container-low">
          <div className={`${wrap} ${sec}`}>
            <h2 className={h2}>{t('howItWorks')}</h2>
            <ol className="mt-8 grid gap-8 expanded:grid-cols-3">
              {steps.map(([h, p], i) => (
                <li key={h} className="flex gap-4">
                  <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-secondary-container font-display text-title-l font-bold text-on-secondary-container">{i + 1}</span>
                  <div>
                    <h3 className="font-display text-title-l font-semibold">{h}</h3>
                    <p className="mt-1 max-w-[40ch] text-body-l text-on-surface-variant">{p}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>
        <section id="proof" className={`${wrap} ${sec}`}>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className={h2}>{t('feedT')}</h2>
              <p className="mt-2 text-body-l text-on-surface-variant">{t('feedSub')}</p>
            </div>
            {rows === SAMPLE_FEED && <SampleTag />}
          </div>
          <div className="mt-8 overflow-x-auto rounded-[12px] border border-outline-variant">
            <table className="w-full min-w-[620px] text-left">
              <thead className="bg-surface-container text-label-l text-on-surface-variant">
                <tr>{['Time', 'Amount', 'Payment', 'Transaction'].map((h) => <th key={h} className="px-4 py-3 font-semibold">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-outline-variant text-body-m">
                {rows.map(([ti, amt, p, tx]) => (
                  <tr key={ti + tx}>
                    <td className="px-4 py-3 font-mono text-on-surface-variant">{ti}</td>
                    <td className="px-4 py-3 font-semibold tabular-nums">{pesos(amt)}</td>
                    <td className="px-4 py-3">{p}</td>
                    <td className="px-4 py-3">
                      <a href={tx.includes('…') ? EXPLORER_URL : txUrl(tx)} target="_blank" rel="noopener" className="inline-flex items-center gap-1 font-mono text-primary underline-offset-4 hover:underline">
                        {tx.includes('…') ? tx : `${tx.slice(0, 6)}…${tx.slice(-4)}`}
                        <Icon name="open_in_new" size={16} />
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <section id="safety" className={`${wrap} ${sec} !pt-0 grid gap-12 large:grid-cols-2`}>
          <div>
            <h2 className={h2}>{t('aiT')}</h2>
            <ul className="mt-6 space-y-6">
              {ai.map(([h, p, icon]) => (
                <li key={h} className="flex gap-4">
                  <Avatar icon={icon} />
                  <div>
                    <h3 className="font-display text-title-m font-semibold">{h}</h3>
                    <p className="mt-1 max-w-[52ch] text-body-l text-on-surface-variant">{p}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h2 className={h2}>{t('limitsT')}</h2>
            <ul className="mt-6 divide-y divide-outline-variant">
              {limits.map(([q, a]) => (
                <li key={q} className="py-4">
                  <p className="text-title-m font-semibold">{q}</p>
                  <p className="mt-1 text-body-l text-on-surface-variant">{a}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>
        <section id="roadmap" className="border-t border-outline-variant">
          <div className={`${wrap} ${sec}`}>
            <h2 className={h2}>{t('roadmap')}</h2>
            <ul className="mt-6 grid gap-6 expanded:grid-cols-3">
              {road.map(([h, p, icon]) => (
                <li key={h} className="flex gap-4">
                  <Avatar icon={icon} tone="tertiary" />
                  <div>
                    <h3 className="font-display text-title-m font-semibold">{h}</h3>
                    <p className="mt-1 text-body-l text-on-surface-variant">{p}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </main>
      <Footer wrap={wrap} />
    </>
  )
}

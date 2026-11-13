// /cashier screens, 1:1 with SCR['cashier-*'] in docs/design/board.html (the look board artifact).
import { QueryClientProvider } from '@tanstack/react-query'
import { createContext, useContext, useState, type FormEvent } from 'react'
import { Navigate, Outlet, useNavigate } from 'react-router'
import { WagmiProvider, useAccount, useConnect, useWriteContract } from 'wagmi'
import { waitForTransactionReceipt } from 'wagmi/actions'
import { useNfc } from '../hooks/useNfc'
import { useT } from '../i18n'
import { ApiError, api, txUrl, type Student } from '../lib/api'
import { getMeta, setMeta } from '../lib/db'
import { useLive } from '../lib/hooks'
import { pesos } from '../lib/pay'
import { SAMPLE_UID, sampleStudent } from '../lib/sample'
import { hashUid, normalizeUid } from '../lib/uid'
import { AppColumn, Avatar, Banner, Button, Card, Chip, Icon, ListItem, SampleTag, TextField, TopBar } from '../ui'
import { LegalLink } from '../ui/more'
import { TOKEN_ADDRESS, queryClient, tokenAbi, wagmiConfig } from './wallet'

type Load = { studentNo: string; amount: number; tx: string; at: number; sample: boolean }
type Cash = {
  uid: string | null
  setUid: (u: string | null) => void
  student: (Student & { sample?: boolean }) | null
  setStudent: (s: (Student & { sample?: boolean }) | null) => void
  last: Load | null
  setLast: (l: Load) => void
}
const Ctx = createContext<Cash | null>(null)
const useCash = () => useContext(Ctx)!

const SAMPLE_MINT_TX = '0x8f2c4e1d7b3a9c5e1f0d2b4a6c8e0f1a3b5c7d9e1f2a4b6c8d0e1f3a5b7c991ab'
const shortTx = (h: string) => `${h.slice(0, 10)}…${h.slice(-4)}`
const ago = (t: number) => {
  const m = Math.round((Date.now() - t) / 60_000)
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`
}

export function CashierLayout() {
  const [uid, setUid] = useState<string | null>(null)
  const [student, setStudent] = useState<Cash['student']>(null)
  const [last, setLast] = useState<Load | null>(null)
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <Ctx.Provider value={{ uid, setUid, student, setStudent, last, setLast }}>
          <Outlet />
        </Ctx.Provider>
      </QueryClientProvider>
    </WagmiProvider>
  )
}

function WalletChip() {
  const { address, isConnected } = useAccount()
  const { connect, connectors } = useConnect()
  if (isConnected && address)
    return (
      <span className="inline-flex h-8 items-center gap-1.5 rounded-full border border-current/40 px-2.5 font-mono text-label-m opacity-90">
        <Icon name="account_balance_wallet" size={16} />
        {`${address.slice(0, 4)}…${address.slice(-2)}`}
      </span>
    )
  return (
    <button type="button" onClick={() => connectors[0] && connect({ connector: connectors[0] })} className="inline-flex h-8 items-center gap-1.5 rounded-full border border-current/40 px-2.5 text-label-m font-semibold">
      <Icon name="account_balance_wallet" size={16} />
      Connect
    </button>
  )
}

/* ---------- Tap ID ---------- */

export function CashierTap() {
  const t = useT()
  const c = useCash()
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const loads = useLive(() => getMeta<Load[]>('loads'), [], undefined) ?? []

  const found = async (serial: string) => {
    const uid = normalizeUid(serial)
    c.setUid(uid)
    setError(null)
    try {
      c.setStudent(await api.byUid(await hashUid(uid)))
      navigate('/cashier/load')
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) return navigate('/cashier/link')
      // No API: the board's demo flow, the next tap is an unlinked ID.
      navigate('/cashier/link')
    }
  }
  const nfc = useNfc((tap) => {
    nfc.stopScan()
    void found(tap.serialNumber)
  })

  const rows = loads.length
    ? loads
    : [
        { studentNo: 'K12345678', amount: 50000, tx: '0x8f2c00000000000000000000000000000000000000000000000000000000091ab', at: Date.now() - 2 * 60_000, sample: true },
        { studentNo: 'K11223344', amount: 20000, tx: '0x3a0700000000000000000000000000000000000000000000000000000000c4d2', at: Date.now() - 9 * 60_000, sample: true },
      ]

  return (
    <AppColumn>
      <TopBar title={t('cashier')} back="/app" actions={<WalletChip />} />
      <div className="flex flex-1 flex-col px-4">
        <div className="flex flex-col items-center gap-5 py-10 text-center">
          <div className="relative grid h-44 w-44 place-items-center rounded-full bg-surface-container-high text-primary">
            <span className="nfc-ring absolute inset-0 rounded-full border-2 border-primary" />
            <Icon name="contactless" size={72} />
          </div>
          <p className="font-display text-headline-s font-semibold">{t('tapId')}</p>
          <p className="max-w-[30ch] text-body-l text-on-surface-variant">{t('tapHint')}</p>
        </div>
        <Button size="l" full icon="contactless" onClick={() => (nfc.isSupported ? void nfc.startScan() : void found(SAMPLE_UID))}>
          {nfc.scanning ? 'Waiting for the ID…' : t('startScan')}
        </Button>
        <p className="mt-2 text-center text-body-s text-on-surface-variant">
          {nfc.isSupported ? 'Hold the ID to the back of this phone.' : 'Demo: the next tap is an unlinked ID.'}
        </p>
        {(error || nfc.error) && nfc.isSupported && <p role="alert" className="mt-2 text-center text-body-m text-error">{error ?? nfc.error}</p>}
        <div className="mt-2 flex justify-center">
          <Button variant="text" icon="person_search" to="/cashier/lookup">{t('cantRead')}</Button>
        </div>
        <div className="mt-6 mb-6">
          <div className="flex items-center justify-between px-1 pb-1">
            <h2 className="font-display text-title-s font-semibold text-on-surface-variant">{t('recentLoads')}</h2>
            {(!loads.length || loads.some((l) => l.sample)) && <SampleTag />}
          </div>
          <div className="divide-y divide-outline-variant">
            {rows.slice(0, 5).map((l) => (
              <ListItem
                key={l.tx + l.at}
                lead={<Avatar icon="add_card" tone="success" />}
                headline={<span className="font-mono">{l.studentNo}</span>}
                support={`${l.tx.slice(0, 6)}…${l.tx.slice(-4)}, ${ago(l.at)}`}
                trail={<span className="text-title-m font-semibold text-success tabular-nums">+{pesos(l.amount)}</span>}
              />
            ))}
          </div>
        </div>
      </div>
    </AppColumn>
  )
}

/* ---------- Look up by student number ---------- */

export function CashierLookup() {
  const t = useT()
  const c = useCash()
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [hit, setHit] = useState<(Student & { sample?: boolean }) | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  const search = async (e: FormEvent) => {
    e.preventDefault()
    setMsg(null)
    setHit(null)
    try {
      setHit(await api.byNo(q.trim()))
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) return setMsg('No student with that number. Check the ID card.')
      const s = await sampleStudent()
      if (q.trim().toUpperCase() === s.studentNo) setHit({ ...s, balance: 0, sample: true })
      else setMsg('Lookup works only online.')
    }
  }

  return (
    <AppColumn>
      <TopBar title={t('lookupT')} back="/cashier" />
      <form onSubmit={search} className="flex flex-1 flex-col gap-4 px-4 py-5">
        <TextField id="q" label={t('searchNo')} value={q} onChange={(e) => setQ(e.target.value)} enterKeyHint="search" required />
        <p className="-mt-3 px-4 text-body-s text-on-surface-variant">{t('lookupSup')}</p>
        {hit && (
          <div className="overflow-hidden rounded-[12px] bg-surface-container-low">
            <ListItem
              onClick={() => {
                c.setStudent(hit)
                navigate('/cashier/load')
              }}
              lead={<Avatar icon="person" />}
              headline={hit.name}
              support={<><span className="font-mono">{hit.studentNo}</span>, linked, balance {pesos(hit.balance)}</>}
              trail={<span className="text-label-l font-semibold text-primary">{t('select')}</span>}
            />
          </div>
        )}
        {msg && <p role="alert" className="text-body-m text-on-surface-variant">{msg}</p>}
        <p className="text-body-s text-on-surface-variant">
          {hit?.sample && <SampleTag />} Lookup works only online. Linking a new card still needs a tap.
        </p>
        <button type="submit" hidden />
      </form>
    </AppColumn>
  )
}

/* ---------- Link new ID ---------- */

export function CashierLink() {
  const t = useT()
  const c = useCash()
  const navigate = useNavigate()
  const [f, setF] = useState({ no: '', name: '', pin: '', pin2: '' })
  const [agree, setAgree] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (!c.uid) return <Navigate to="/cashier" replace />
  const uidText = c.uid.toUpperCase().match(/../g)?.join(':')

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!/^\d{4}$/.test(f.pin)) return setError('The PIN is 4 digits.')
    if (f.pin !== f.pin2) return setError('The two PINs do not match.')
    setError(null)
    try {
      c.setStudent(await api.link({ uid: c.uid!, studentNo: f.no.trim(), name: f.name.trim(), pin: f.pin }))
    } catch (err) {
      if (err instanceof ApiError) return setError(err.status === 409 ? 'This ID or student number is already linked.' : err.message)
      // No API: continue the demo with the entered details, labelled Sample.
      const s = await sampleStudent()
      c.setStudent({ ...s, studentNo: f.no.trim(), name: f.name.trim(), balance: 0, sample: true })
    }
    navigate('/cashier/load')
  }
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value })

  return (
    <AppColumn>
      <TopBar title={t('linkT')} back="/cashier" />
      <form onSubmit={submit} className="flex flex-1 flex-col gap-4 px-4 py-5">
        <div className="flex items-center gap-3 rounded-[12px] bg-warning-container p-4 text-on-warning-container">
          <Icon name="badge" />
          <div className="min-w-0">
            <p className="text-title-s font-semibold">{t('notLinked')}</p>
            <p className="font-mono text-body-s">UID {uidText}</p>
          </div>
        </div>
        <TextField id="sno" label={t('studentNo')} value={f.no} onChange={set('no')} required />
        <TextField id="sname" label={t('name')} value={f.name} onChange={set('name')} autoComplete="off" required />
        <TextField id="spin" label={t('setPin')} type="password" inputMode="numeric" maxLength={4} value={f.pin} onChange={set('pin')} autoComplete="new-password" required />
        <TextField id="spin2" label={t('confirmPin')} type="password" inputMode="numeric" maxLength={4} value={f.pin2} onChange={set('pin2')} autoComplete="new-password" required />
        <label className="flex items-start gap-3 py-1 text-body-m" htmlFor="consent-link">
          <input id="consent-link" type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} required className="mt-0.5 h-[18px] w-[18px] shrink-0 accent-[var(--primary)]" />
          <span>
            {t('consentLink')} <LegalLink which="privacy">{t('privacy')}</LegalLink>
          </span>
        </label>
        {error && <p role="alert" className="text-body-m text-error">{error}</p>}
        <div className="mt-auto mb-4">
          <Button size="l" full type="submit" disabled={!agree}>{t('saveCont')}</Button>
        </div>
      </form>
    </AppColumn>
  )
}

/* ---------- Load credits ---------- */

const AMOUNTS = [100, 200, 500, 1000]

export function CashierLoad() {
  const t = useT()
  const c = useCash()
  const navigate = useNavigate()
  const [pesoAmt, setPesoAmt] = useState(500)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const { isConnected } = useAccount()
  const { writeContractAsync } = useWriteContract()
  const s = c.student
  if (!s) return <Navigate to="/cashier" replace />
  const live = !!TOKEN_ADDRESS && !s.sample

  const mint = async () => {
    setError(null)
    setBusy(true)
    const amount = pesoAmt * 100 // centavos, TagakPeso has 2 decimals
    try {
      let tx = SAMPLE_MINT_TX
      if (live) {
        if (!isConnected) throw new Error('Connect MetaMask first (top right).')
        tx = await writeContractAsync({ address: TOKEN_ADDRESS!, abi: tokenAbi, functionName: 'mint', args: [s.address, BigInt(amount)] })
        await waitForTransactionReceipt(wagmiConfig, { hash: tx as `0x${string}` })
      }
      const load: Load = { studentNo: s.studentNo, amount, tx, at: Date.now(), sample: !live }
      c.setLast(load)
      c.setStudent({ ...s, balance: s.balance + amount })
      await setMeta('loads', [load, ...((await getMeta<Load[]>('loads')) ?? [])].slice(0, 20))
      navigate('/cashier/done')
    } catch (e) {
      setError((e as Error).message.split('\n')[0])
    } finally {
      setBusy(false)
    }
  }

  return (
    <AppColumn>
      <TopBar title={t('loadT')} back="/cashier" actions={<WalletChip />} />
      <div className="flex flex-1 flex-col gap-6 px-4 py-5">
        <Card>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-title-m font-semibold">{s.name}</p>
              <p className="font-mono text-body-m text-on-surface-variant">{s.studentNo}</p>
            </div>
            <div className="text-right">
              <p className="text-label-m text-on-surface-variant">{t('balance')}</p>
              <p className="text-title-l font-semibold tabular-nums">{pesos(s.balance)}</p>
            </div>
          </div>
        </Card>
        <div>
          <p className="text-label-l text-on-surface-variant">{t('amount')}</p>
          <p className="font-display text-display-m font-semibold tabular-nums">{pesos(pesoAmt * 100)}</p>
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Amount">
          {AMOUNTS.map((v) => (
            <Chip key={v} selected={v === pesoAmt} onClick={() => setPesoAmt(v)}>₱{v.toLocaleString('en-PH')}</Chip>
          ))}
        </div>
        {!live && (
          <Banner tone="warning" icon="sync_problem" title="Contract not deployed yet">
            Minting runs as a sample until the TagakPeso address is set.
          </Banner>
        )}
        {error && <p role="alert" className="text-body-m text-error">{error}</p>}
        <div className="mt-auto mb-4 space-y-2">
          <Button size="l" full icon="account_balance_wallet" disabled={busy} onClick={() => void mint()}>
            {busy ? 'Waiting for MetaMask…' : t('mint')}
          </Button>
          <p className="text-center text-body-s text-on-surface-variant">{t('mintHint')}</p>
        </div>
      </div>
    </AppColumn>
  )
}

/* ---------- Loaded ---------- */

export function CashierDone() {
  const t = useT()
  const c = useCash()
  const navigate = useNavigate()
  if (!c.last || !c.student) return <Navigate to="/cashier" replace />
  const { last, student } = c
  const next = () => {
    c.setUid(null)
    c.setStudent(null)
    navigate('/cashier')
  }
  return (
    <AppColumn>
      <TopBar title={t('loaded')} back={next} />
      <div className="flex flex-1 flex-col gap-5 px-4 py-6">
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <span className="grid h-16 w-16 place-items-center rounded-full bg-success-container text-on-success-container">
            <Icon name="check" size={36} />
          </span>
          <p className="font-display text-display-s font-bold tabular-nums">{pesos(last.amount)}</p>
          <p className="text-body-l">
            {student.name} {t('nowHas')} {pesos(student.balance)} tPHP.
          </p>
        </div>
        <Card>
          <p className="text-label-l text-on-surface-variant">Mint transaction {last.sample && <SampleTag />}</p>
          <p className="mt-1 break-all font-mono text-body-m">{shortTx(last.tx)}</p>
          <a href={txUrl(last.tx)} target="_blank" rel="noopener" className="mt-2 inline-flex h-10 items-center gap-1.5 text-label-l font-semibold text-primary">
            {t('viewExplorer')} <Icon name="open_in_new" size={18} />
          </a>
        </Card>
        <div className="mt-auto mb-4">
          <Button size="l" full onClick={next}>{t('nextStudent')}</Button>
        </div>
      </div>
    </AppColumn>
  )
}


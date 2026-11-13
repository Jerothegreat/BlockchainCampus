// /cashier, to docs/design/board-A/cashier-*.html: tap ID → link a blank ID, or load cash onto a linked one.
// Every change returns a new wallet record that is written back to the card before "Done".
import { useState } from 'react'
import type { Hex } from 'viem'
import { useCashierKey } from '../hooks/useCashierKey'
import { useCard, type CardTap } from '../hooks/useCard'
import { ApiError, api, errorText, type Student } from '../lib/api'
import { addressUrl, txUrl } from '../lib/chain'
import { useOnline } from '../lib/hooks'
import { pesos } from '../lib/pay'
import { AppColumn, Banner, Button, Card, Chip, Icon, NetChip, TextField, TopBar } from '../ui'
import { CardWriter } from '../ui/CardWriter'
import { DemoCards } from '../ui/DemoCards'

const AMOUNTS = [10000, 20000, 50000, 100000]

type View =
  | { kind: 'tap' }
  | { kind: 'busy'; text: string }
  | { kind: 'link'; tap: CardTap }
  | { kind: 'load'; tap: CardTap; student: Student }
  | { kind: 'write'; tap: CardTap; card: Hex; done: Done }
  | { kind: 'done'; done: Done }
  | { kind: 'error'; message: string; tap?: CardTap }

type Done = { title: string; name: string; studentNo: string; balance: number; txHash?: string; address?: string }

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`

export default function Cashier() {
  const online = useOnline()
  const [key, setKey] = useCashierKey()
  const [view, setView] = useState<View>({ kind: 'tap' })

  const card = useCard((t) => void onTap(t))
  async function onTap(tap: CardTap) {
    card.stop()
    if (!tap.card) return setView({ kind: 'link', tap })
    setView({ kind: 'busy', text: 'Looking up this ID…' })
    try {
      setView({ kind: 'load', tap, student: await api.byUid(tap.uidHash) })
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) return setView({ kind: 'link', tap })
      setView({ kind: 'error', message: errorText(e) })
    }
  }
  const restart = () => setView({ kind: 'tap' })

  if (!key) return <KeyGate onKey={setKey} />

  return (
    <AppColumn>
      <TopBar
        title={view.kind === 'link' ? 'Link new ID' : view.kind === 'load' ? 'Load credits' : 'Cashier'}
        back={view.kind === 'tap' ? '/app' : restart}
        actions={<NetChip online={online} />}
      />
      <div className="flex flex-1 flex-col px-4">
        {view.kind === 'tap' && (
          <>
            <div className="flex flex-col items-center gap-5 py-10 text-center">
              <div className="relative grid h-44 w-44 place-items-center rounded-full bg-surface-container-high text-primary">
                {card.nfc.scanning && <span className="nfc-ring absolute inset-0 rounded-full border-2 border-primary" />}
                <Icon name="contactless" size={72} />
              </div>
              <p className="font-display text-headline-s font-semibold">Tap student ID</p>
              <p className="max-w-[30ch] text-body-l text-on-surface-variant">Hold the ID flat on the back of this phone.</p>
            </div>
            {card.nfc.isSupported ? (
              <Button size="l" full icon="contactless" disabled={card.nfc.scanning} onClick={() => void card.start()}>
                {card.nfc.scanning ? 'Waiting for an ID…' : 'Start scanning'}
              </Button>
            ) : (
              <Banner tone="warning" icon="nfc" title="NFC is not available here">Use Chrome on Android, or a demo ID below.</Banner>
            )}
            {card.nfc.error && <p className="mt-2 text-center text-body-m text-error">{card.nfc.error}</p>}
            <div className="mt-6">
              <DemoCards allowNew onTap={(uid) => void card.tapVirtual(uid)} />
            </div>
            <div className="mt-auto flex justify-center py-4">
              <Button variant="text" icon="password" onClick={() => setKey('')}>Forget cashier key</Button>
            </div>
          </>
        )}
        {view.kind === 'busy' && <p className="py-16 text-center text-body-l text-on-surface-variant">{view.text}</p>}
        {view.kind === 'link' && (
          <LinkForm
            tap={view.tap}
            onSubmit={async (b) => {
              setView({ kind: 'busy', text: 'Creating the wallet and linking the ID on-chain…' })
              try {
                const res = await api.link(key, { uid: view.tap.uid, ...b })
                const done: Done = { title: 'ID linked', name: b.name || b.studentNo, studentNo: b.studentNo, balance: 0, txHash: res.linkTx ?? undefined, address: res.address }
                setView({ kind: 'write', tap: view.tap, card: res.card, done })
              } catch (e) {
                setView({ kind: 'error', message: errorText(e) })
              }
            }}
          />
        )}
        {view.kind === 'load' && (
          <LoadForm
            student={view.student}
            onSubmit={async (amount, orNumber) => {
              const { tap, student } = view
              setView({ kind: 'busy', text: 'Minting tPHP to the ID’s wallet…' })
              try {
                const res = await api.topUpCash(key, { uid: tap.uid, card: tap.card!, amount, orNumber })
                const done: Done = { title: 'Loaded', name: student.name, studentNo: student.studentNo, balance: res.balance, txHash: res.txHash }
                setView({ kind: 'write', tap, card: res.card, done })
              } catch (e) {
                setView({ kind: 'error', message: errorText(e), tap })
              }
            }}
          />
        )}
        {view.kind === 'write' && <CardWriter tap={view.tap} card={view.card} write={card.write} onDone={() => setView({ kind: 'done', done: view.done })} />}
        {view.kind === 'done' && <DoneView done={view.done} onNext={restart} />}
        {view.kind === 'error' && (
          <div className="flex flex-1 flex-col gap-4 py-6">
            <Banner tone="error" icon="error" title="That didn't go through">{view.message}</Banner>
            <div className="mt-auto mb-4">
              <Button size="l" full onClick={restart}>Back to Tap ID</Button>
            </div>
          </div>
        )}
      </div>
    </AppColumn>
  )
}

function KeyGate({ onKey }: { onKey: (k: string) => void }) {
  const [value, setValue] = useState('')
  return (
    <AppColumn>
      <TopBar title="Cashier" back="/app" />
      <form
        className="flex flex-1 flex-col gap-5 px-4 py-6"
        onSubmit={(e) => {
          e.preventDefault()
          if (value.trim()) onKey(value.trim())
        }}
      >
        <p className="text-body-l text-on-surface-variant">Enter the cashier key from the server's CASHIER_KEY. This phone remembers it.</p>
        <TextField id="cashier-key" label="Cashier key" type="password" autoComplete="off" value={value} onChange={(e) => setValue(e.target.value)} />
        <div className="mt-auto mb-4">
          <Button size="l" full type="submit" disabled={!value.trim()}>Continue</Button>
        </div>
      </form>
    </AppColumn>
  )
}

function LinkForm({ tap, onSubmit }: { tap: CardTap; onSubmit: (b: { studentNo: string; name: string; pin: string }) => void }) {
  const [studentNo, setStudentNo] = useState('')
  const [name, setName] = useState('')
  const [pin, setPin] = useState('')
  const [consent, setConsent] = useState(false)
  const valid = studentNo.trim() && /^\d{4,6}$/.test(pin) && consent
  return (
    <form
      className="flex flex-1 flex-col gap-4 py-5"
      onSubmit={(e) => {
        e.preventDefault()
        if (valid) onSubmit({ studentNo: studentNo.trim(), name: name.trim(), pin })
      }}
    >
      <Card>
        <p className="text-title-m font-semibold">New ID</p>
        <p className="font-mono text-body-m text-on-surface-variant">UID …{tap.uid.slice(-6).toUpperCase()}{tap.virtual ? ' (demo)' : ''}</p>
      </Card>
      <TextField id="student-no" label="Student number" mono value={studentNo} onChange={(e) => setStudentNo(e.target.value)} />
      <TextField id="student-name" label="Name" value={name} onChange={(e) => setName(e.target.value)} />
      <TextField id="pin" label="PIN (4 to 6 digits)" mono inputMode="numeric" type="password" maxLength={6} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} />
      <label className="flex items-start gap-3 text-body-m text-on-surface-variant">
        <input type="checkbox" className="mt-1 h-5 w-5 accent-[var(--primary)]" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
        The student agrees to link this ID to a UMak Pay wallet. Payments are public on the testnet explorer.
      </label>
      <div className="mt-auto mb-4">
        <Button size="l" full type="submit" icon="badge" disabled={!valid}>Link ID</Button>
      </div>
    </form>
  )
}

function LoadForm({ student, onSubmit }: { student: Student; onSubmit: (amount: number, orNumber: string) => void }) {
  const [amount, setAmount] = useState(50000)
  const [orNumber, setOrNumber] = useState('')
  return (
    <form
      className="flex flex-1 flex-col gap-6 py-5"
      onSubmit={(e) => {
        e.preventDefault()
        if (orNumber.trim()) onSubmit(amount, orNumber.trim())
      }}
    >
      <Card>
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-title-m font-semibold">{student.name}</p>
            <p className="font-mono text-body-m text-on-surface-variant">{student.studentNo}</p>
          </div>
          <div className="text-right">
            <p className="text-label-m text-on-surface-variant">Balance</p>
            <p className="text-title-l font-semibold tabular-nums">{pesos(student.balance)}</p>
          </div>
        </div>
      </Card>
      <div>
        <p className="text-label-l text-on-surface-variant">Amount</p>
        <p className="font-display text-display-m font-semibold tabular-nums">{pesos(amount)}</p>
      </div>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Amount">
        {AMOUNTS.map((a) => (
          <Chip key={a} selected={a === amount} onClick={() => setAmount(a)}>
            {pesos(a).replace('.00', '')}
          </Chip>
        ))}
      </div>
      <TextField id="or-number" label="Official receipt (OR) number" mono value={orNumber} onChange={(e) => setOrNumber(e.target.value)} />
      <div className="mt-auto mb-4 space-y-2">
        <Button size="l" full type="submit" icon="account_balance_wallet" disabled={!orNumber.trim()}>Load {pesos(amount)}</Button>
        <p className="text-center text-body-s text-on-surface-variant">Mints test tPHP to the ID's wallet. No real money.</p>
      </div>
    </form>
  )
}

function DoneView({ done, onNext }: { done: Done; onNext: () => void }) {
  return (
    <div className="flex flex-1 flex-col gap-5 py-8">
      <div className="flex flex-col items-center gap-3 text-center">
        <span className="grid h-20 w-20 place-items-center rounded-full bg-success-container text-on-success-container">
          <Icon name="check" size={44} />
        </span>
        <p className="font-display text-headline-s font-semibold">{done.title}</p>
        <p className="text-body-l text-on-surface-variant">
          {done.name}, <span className="font-mono">{done.studentNo}</span>
        </p>
      </div>
      <Card>
        <div className="flex items-center justify-between">
          <span className="text-body-l text-on-surface-variant">Balance on the ID</span>
          <span className="text-title-l font-semibold tabular-nums">{pesos(done.balance)}</span>
        </div>
        {done.address && (
          <a className="mt-2 block font-mono text-body-m text-primary underline" href={addressUrl(done.address)} target="_blank" rel="noreferrer">
            Wallet {short(done.address)}
          </a>
        )}
        {done.txHash && (
          <a className="mt-2 block font-mono text-body-m text-primary underline" href={txUrl(done.txHash)} target="_blank" rel="noreferrer">
            Transaction {short(done.txHash)}
          </a>
        )}
      </Card>
      <div className="mt-auto mb-4">
        <Button size="l" full onClick={onNext}>Next student</Button>
      </div>
    </div>
  )
}

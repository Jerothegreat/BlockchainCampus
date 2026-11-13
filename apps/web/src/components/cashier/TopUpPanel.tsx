import { useState } from 'react'
import { api, errorMessage, type MintResult, type Student } from '../../lib/api'
import { formatPeso, parsePeso } from '../../lib/money'

type Props = { cashierKey: string; student: Student; onToppedUp: () => void; onAuthError: () => void }

const PRESETS = [5000, 10000, 20000, 50000] // centavos

/** Cash in → mint UMakCredit to the student's address (backend signs with the Deployer key). */
export function TopUpPanel({ cashierKey, student, onToppedUp, onAuthError }: Props) {
  const [custom, setCustom] = useState('')
  const [busy, setBusy] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [last, setLast] = useState<(MintResult & { amount: number }) | null>(null)

  const topUp = async (amount: number) => {
    if (busy) return
    setBusy(amount)
    setError(null)
    try {
      const result = await api.mint(cashierKey, student.uidHash, amount)
      setLast({ ...result, amount })
      setCustom('')
      onToppedUp()
    } catch (err) {
      if ((err as { status?: number }).status === 401) onAuthError()
      setError(errorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  const customAmount = parsePeso(custom)

  return (
    <section className="mt-4 rounded-xl bg-white p-4 shadow-sm">
      <p className="text-sm text-slate-500">{student.studentNo}</p>
      <p className="text-lg font-bold">{student.name}</p>
      <p className="mt-2 text-3xl font-bold tabular-nums">{formatPeso(student.balance)}</p>
      <p className="text-xs text-slate-500">Offline limit {formatPeso(student.offlineCap)}</p>

      <h2 className="mt-4 text-sm font-semibold">Top up</h2>
      <div className="mt-2 grid grid-cols-2 gap-2">
        {PRESETS.map((amount) => (
          <button key={amount} onClick={() => topUp(amount)} disabled={busy !== null}
            className="rounded-xl bg-emerald-600 py-3 font-semibold text-white disabled:opacity-40">
            {busy === amount ? 'Minting…' : `+ ${formatPeso(amount)}`}
          </button>
        ))}
      </div>
      <div className="mt-2 flex gap-2">
        <label htmlFor="custom-amount" className="sr-only">Custom amount in pesos</label>
        <input id="custom-amount" inputMode="decimal" placeholder="Other amount (₱)" value={custom}
          onChange={(e) => setCustom(e.target.value)} className="min-w-0 flex-1 rounded-lg border border-slate-300 p-3" />
        <button onClick={() => customAmount && topUp(customAmount)} disabled={!customAmount || busy !== null}
          className="rounded-xl bg-slate-900 px-4 font-semibold text-white disabled:opacity-40">
          {busy === customAmount ? 'Minting…' : 'Top up'}
        </button>
      </div>

      {error && <p className="mt-3 rounded-lg bg-rose-100 p-2 text-sm text-rose-900">{error}</p>}
      {last && (
        <p className="mt-3 rounded-lg bg-emerald-50 p-2 text-sm text-emerald-900">
          ✓ Added {formatPeso(last.amount)} on-chain.{' '}
          {last.explorer && (
            <a href={last.explorer} target="_blank" rel="noreferrer" className="underline">
              View transaction
            </a>
          )}
        </p>
      )}
    </section>
  )
}

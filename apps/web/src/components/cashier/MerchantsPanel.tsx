import { useEffect, useState, type FormEvent } from 'react'
import { api, errorMessage, type Merchant } from '../../lib/api'

type Props = { cashierKey: string; onAuthError: () => void }

/** Stalls that can receive payments (POS picks one of these). */
export function MerchantsPanel({ cashierKey, onAuthError }: Props) {
  const [merchants, setMerchants] = useState<Merchant[]>([])
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.merchants().then(setMerchants).catch((err) => setError(errorMessage(err)))
  }, [])

  const add = async (e: FormEvent) => {
    e.preventDefault()
    if (!name.trim() || busy) return
    setBusy(true)
    setError(null)
    try {
      const merchant = await api.addMerchant(cashierKey, name.trim())
      setMerchants((m) => [...m, merchant].sort((a, b) => a.name.localeCompare(b.name)))
      setName('')
    } catch (err) {
      if ((err as { status?: number }).status === 401) onAuthError()
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <details className="mt-6 rounded-xl bg-white p-4 shadow-sm">
      <summary className="cursor-pointer text-sm font-semibold">Stalls ({merchants.length})</summary>
      <ul className="mt-2 divide-y divide-slate-100 text-sm">
        {merchants.map((m) => (
          <li key={m.id} className="flex justify-between gap-2 py-2">
            <span>{m.name}</span>
            <span className="truncate font-mono text-xs text-slate-500">{m.address}</span>
          </li>
        ))}
      </ul>
      <form onSubmit={add} className="mt-2 flex gap-2">
        <label htmlFor="merchant-name" className="sr-only">Stall name</label>
        <input id="merchant-name" placeholder="New stall name" value={name} onChange={(e) => setName(e.target.value)}
          className="min-w-0 flex-1 rounded-lg border border-slate-300 p-2" />
        <button disabled={!name.trim() || busy} className="rounded-lg bg-slate-900 px-3 text-sm font-semibold text-white disabled:opacity-40">
          Add
        </button>
      </form>
      {error && <p className="mt-2 text-sm text-rose-700">{error}</p>}
    </details>
  )
}

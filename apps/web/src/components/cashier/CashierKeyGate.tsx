import { useState, type FormEvent } from 'react'

/** Asks once for the server's CASHIER_KEY; stored on this device afterwards. */
export function CashierKeyGate({ onSubmit }: { onSubmit: (key: string) => void }) {
  const [value, setValue] = useState('')
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (value.trim()) onSubmit(value.trim())
  }
  return (
    <form onSubmit={submit} className="mt-4 rounded-xl bg-white p-4 shadow-sm">
      <label htmlFor="cashier-key" className="text-sm font-semibold">
        Cashier key
      </label>
      <p className="text-xs text-slate-500">From CASHIER_KEY in the API's .env. Saved on this device.</p>
      <input
        id="cashier-key"
        type="password"
        autoComplete="off"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="mt-2 w-full rounded-lg border border-slate-300 p-3 font-mono"
      />
      <button className="mt-3 w-full rounded-xl bg-slate-900 py-3 font-semibold text-white">Unlock</button>
    </form>
  )
}

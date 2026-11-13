import { useState, type FormEvent } from 'react'
import { api, errorMessage } from '../../lib/api'

type Props = { cashierKey: string; uid: string; onLinked: () => void; onAuthError: () => void }

const input = 'mt-1 w-full rounded-lg border border-slate-300 p-3'

/** First tap of an unknown ID: register the student and set their payment PIN. */
export function LinkForm({ cashierKey, uid, onLinked, onAuthError }: Props) {
  const [studentNo, setStudentNo] = useState('')
  const [name, setName] = useState('')
  const [pin, setPin] = useState('')
  const [pin2, setPin2] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const pinValid = /^\d{4,6}$/.test(pin)
  const canSubmit = studentNo.trim() && pinValid && pin === pin2 && !busy

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!canSubmit) return
    setBusy(true)
    setError(null)
    try {
      await api.link(cashierKey, { uid, studentNo: studentNo.trim(), name: name.trim() || undefined, pin })
      onLinked()
    } catch (err) {
      if ((err as { status?: number }).status === 401) onAuthError()
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="mt-4 space-y-3 rounded-xl bg-white p-4 shadow-sm">
      <p className="text-sm font-semibold text-amber-700">New ID: link it to a student</p>
      <div>
        <label htmlFor="student-no" className="text-sm text-slate-600">Student number</label>
        <input id="student-no" value={studentNo} onChange={(e) => setStudentNo(e.target.value)} className={input} />
      </div>
      <div>
        <label htmlFor="student-name" className="text-sm text-slate-600">Name (optional)</label>
        <input id="student-name" value={name} onChange={(e) => setName(e.target.value)} className={input} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label htmlFor="pin" className="text-sm text-slate-600">PIN (4–6 digits)</label>
          <input id="pin" type="password" inputMode="numeric" maxLength={6} value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} className={input} />
        </div>
        <div>
          <label htmlFor="pin2" className="text-sm text-slate-600">Confirm PIN</label>
          <input id="pin2" type="password" inputMode="numeric" maxLength={6} value={pin2}
            onChange={(e) => setPin2(e.target.value.replace(/\D/g, ''))} className={input} />
        </div>
      </div>
      {pin2 && pin !== pin2 && <p className="text-xs text-rose-700">PINs don't match.</p>}
      {error && <p className="rounded-lg bg-rose-100 p-2 text-sm text-rose-900">{error}</p>}
      <button disabled={!canSubmit} className="w-full rounded-xl bg-slate-900 py-3 font-semibold text-white disabled:opacity-40">
        {busy ? 'Linking…' : 'Link ID'}
      </button>
    </form>
  )
}

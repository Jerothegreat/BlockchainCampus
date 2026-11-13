import { useCallback, useRef, useState } from 'react'
import { CashierKeyGate } from '../components/cashier/CashierKeyGate'
import { LinkForm } from '../components/cashier/LinkForm'
import { MerchantsPanel } from '../components/cashier/MerchantsPanel'
import { TopUpPanel } from '../components/cashier/TopUpPanel'
import { useCashierKey } from '../hooks/useCashierKey'
import { useNfc, type NfcTap } from '../hooks/useNfc'
import { ApiError, api, errorMessage, type Student } from '../lib/api'

type View =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'unlinked'; tap: NfcTap }
  | { kind: 'student'; tap: NfcTap; student: Student }
  | { kind: 'error'; message: string }

/** Cashier desk: tap ID → link it (first time) → take cash → top up on-chain. */
export default function Cashier() {
  const [cashierKey, setCashierKey] = useCashierKey()
  const [view, setView] = useState<View>({ kind: 'idle' })
  const latestTap = useRef(0) // ignore responses for taps that were superseded

  const lookup = useCallback(async (tap: NfcTap) => {
    latestTap.current = tap.at
    setView({ kind: 'loading' })
    try {
      const student = await api.studentByUid(tap.uidHash)
      if (latestTap.current === tap.at) setView({ kind: 'student', tap, student })
    } catch (err) {
      if (latestTap.current !== tap.at) return
      if (err instanceof ApiError && err.status === 404) setView({ kind: 'unlinked', tap })
      else setView({ kind: 'error', message: errorMessage(err) })
    }
  }, [])

  const { isSupported, scanning, error: nfcError, startScan, stopScan } = useNfc(lookup)
  const resetKey = () => setCashierKey('')
  // After link/top-up: reload the student in place (no loading state, so the panel keeps its success message).
  const refresh = async () => {
    if (view.kind !== 'student' && view.kind !== 'unlinked') return
    const { tap } = view
    try {
      const student = await api.studentByUid(tap.uidHash)
      if (latestTap.current === tap.at) setView({ kind: 'student', tap, student })
    } catch (err) {
      if (latestTap.current === tap.at) setView({ kind: 'error', message: errorMessage(err) })
    }
  }

  return (
    <main className="mx-auto min-h-dvh max-w-md bg-slate-50 p-4 text-slate-900">
      <header className="flex items-baseline justify-between">
        <h1 className="text-xl font-bold">UMak Pay · Cashier</h1>
        {cashierKey && (
          <button onClick={resetKey} className="text-xs text-slate-500 underline">
            Lock
          </button>
        )}
      </header>

      {!cashierKey ? (
        <CashierKeyGate onSubmit={setCashierKey} />
      ) : (
        <>
          {!isSupported && (
            <p className="mt-4 rounded-lg bg-amber-100 p-3 text-sm text-amber-900">
              Web NFC isn't available here. Use Chrome on Android with NFC on.
            </p>
          )}
          <button
            onClick={scanning ? stopScan : startScan}
            disabled={!isSupported}
            className={`mt-4 w-full rounded-xl py-4 text-lg font-semibold text-white disabled:opacity-40 ${
              scanning ? 'bg-rose-600' : 'bg-slate-900'
            }`}
          >
            {scanning ? 'Stop scanning' : 'Start scanning'}
          </button>
          {scanning && view.kind === 'idle' && (
            <p className="mt-2 animate-pulse text-center text-sm text-slate-600">Tap a student ID…</p>
          )}
          {nfcError && <p className="mt-4 rounded-lg bg-rose-100 p-3 text-sm text-rose-900">{nfcError}</p>}

          {view.kind === 'loading' && <p className="mt-4 text-center text-sm text-slate-600">Looking up ID…</p>}
          {view.kind === 'error' && (
            <p className="mt-4 rounded-lg bg-rose-100 p-3 text-sm text-rose-900">{view.message}</p>
          )}
          {view.kind === 'unlinked' && (
            <LinkForm key={view.tap.at} cashierKey={cashierKey} uid={view.tap.uid} onLinked={refresh} onAuthError={resetKey} />
          )}
          {view.kind === 'student' && (
            <TopUpPanel key={view.tap.uidHash} cashierKey={cashierKey} student={view.student} onToppedUp={refresh} onAuthError={resetKey} />
          )}

          <MerchantsPanel cashierKey={cashierKey} onAuthError={resetKey} />
        </>
      )}
    </main>
  )
}

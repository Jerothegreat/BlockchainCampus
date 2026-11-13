import { useState } from 'react'
import { useNfc, type NfcTap } from './hooks/useNfc'

// Week 1 chip check (PRD §6.3): tap real student IDs and confirm
// 1) Chrome on this phone can read them, 2) the UID is stable across taps.
export default function App() {
  const [history, setHistory] = useState<NfcTap[]>([])
  const { isSupported, scanning, lastTap, error, startScan, stopScan } = useNfc((tap) =>
    setHistory((h) => [tap, ...h].slice(0, 50)),
  )

  const tapsOfLast = lastTap ? history.filter((t) => t.uidHash === lastTap.uidHash).length : 0

  return (
    <main className="mx-auto min-h-dvh max-w-md bg-slate-50 p-4 text-slate-900">
      <h1 className="text-xl font-bold">UMak Pay · ID chip check</h1>
      <p className="mt-1 text-sm text-slate-600">Tap a student ID on the back of the phone.</p>

      {!isSupported && (
        <p className="mt-4 rounded-lg bg-amber-100 p-3 text-sm text-amber-900">
          Web NFC isn't available here. Open this page in Chrome on an Android phone with NFC on, over HTTPS.
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
      {scanning && <p className="mt-2 animate-pulse text-center text-sm text-slate-600">Waiting for card…</p>}

      {error && <p className="mt-4 rounded-lg bg-rose-100 p-3 text-sm text-rose-900">{error}</p>}

      {lastTap && (
        <section className="mt-4 rounded-xl bg-white p-4 shadow-sm">
          <p className="text-sm font-semibold text-emerald-700">
            ✓ Card read · seen {tapsOfLast}× this session
          </p>
          <dl className="mt-3 space-y-2 text-sm">
            <div>
              <dt className="text-slate-500">UID ({lastTap.uid.length / 2} bytes)</dt>
              <dd className="break-all font-mono">{lastTap.serialNumber}</dd>
            </div>
            <div>
              <dt className="text-slate-500">uidHash (SHA-256)</dt>
              <dd className="break-all font-mono text-xs">{lastTap.uidHash}</dd>
            </div>
            <div>
              <dt className="text-slate-500">NDEF records</dt>
              <dd>
                {lastTap.records.length === 0
                  ? 'None (normal for ID cards)'
                  : lastTap.records.map((r, i) => (
                      <span key={i} className="block font-mono text-xs">
                        {r.recordType}
                        {r.mediaType ? ` (${r.mediaType})` : ''}: {r.data}
                      </span>
                    ))}
              </dd>
            </div>
          </dl>
        </section>
      )}

      {history.length > 0 && (
        <section className="mt-4">
          <h2 className="text-sm font-semibold text-slate-700">Tap log</h2>
          <ul className="mt-2 divide-y divide-slate-200 rounded-xl bg-white text-xs shadow-sm">
            {history.map((t) => (
              <li key={t.at} className="flex justify-between gap-2 p-2 font-mono">
                <span className="truncate">{t.serialNumber}</span>
                <span className="shrink-0 text-slate-500">{new Date(t.at).toLocaleTimeString()}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  )
}

// The signature: a torn thermal-paper slip (design brief rule 4). Markup from the board's slip() helper.
import { QRCodeSVG } from 'qrcode.react'
import { pesos } from '../lib/pay'

export type SlipRow = { label: string; value: string; muted?: boolean }
export type StampKind = { kind: 'settled'; block: number | null } | { kind: 'pending' }

const when = (t: number) =>
  new Date(t).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).replace(',', '').replace(',', '')

export function Stamp({ stamp }: { stamp: StampKind }) {
  return stamp.kind === 'settled' ? (
    <div className="stamp stamp-ok" aria-hidden="true">
      SETTLED
      {stamp.block != null && <small>block {stamp.block.toLocaleString('en-US')}</small>}
    </div>
  ) : (
    <div className="stamp stamp-pend" aria-hidden="true">
      PENDING
      <small>waiting for signal</small>
    </div>
  )
}

export function ReceiptSlip({
  merchant,
  createdAt,
  rows,
  total,
  id,
  qr,
  stamp,
  print,
}: {
  merchant: string
  createdAt: number
  rows: SlipRow[]
  total: number
  id: string
  /** QR payload. Always black on white, the one literal colour allowed (design brief rule 2). */
  qr?: string
  stamp?: StampKind
  /** Play the print-in animation (Approved). */
  print?: boolean
}) {
  return (
    <div className={['mx-auto w-full max-w-[340px]', stamp && 'stamp-in'].filter(Boolean).join(' ')}>
      <div className="slip-wrap">
        <div className={['slip relative bg-paper px-5 py-7 text-on-paper', print && 'print-in', stamp && '!pb-24'].filter(Boolean).join(' ')}>
          <p className="text-center font-display text-title-m font-bold">{merchant}</p>
          <p className="text-center font-mono text-body-s text-paper-muted">HeronPay receipt, {when(createdAt)}</p>
          <div className="my-3 border-t border-dashed border-paper-muted" />
          <dl className="grid grid-cols-[1fr_auto] gap-y-1 font-mono text-body-m">
            {rows.map((r) => (
              <Row key={r.label} {...r} />
            ))}
          </dl>
          <div className="my-3 border-t border-dashed border-paper-muted" />
          <div className="flex items-baseline justify-between">
            <span className="font-mono text-body-m">TOTAL</span>
            <span className="font-mono text-headline-s font-semibold tabular-nums">{pesos(total)}</span>
          </div>
          {qr && (
            <div className="mt-4 grid place-items-center">
              <QRCodeSVG value={qr} className="w-48 h-48" marginSize={2} level="L" bgColor="#FFFFFF" fgColor="#000000" role="img" aria-label="Receipt QR code" />
            </div>
          )}
          <p className="mt-3 text-center font-mono text-label-s text-paper-muted">id {id.slice(0, 18)}</p>
          {stamp && <Stamp stamp={stamp} />}
        </div>
      </div>
    </div>
  )
}

function Row({ label, value, muted }: SlipRow) {
  return (
    <>
      <dt className={muted ? 'text-paper-muted' : undefined}>{label}</dt>
      <dd className={muted ? 'text-paper-muted' : undefined}>{value}</dd>
    </>
  )
}

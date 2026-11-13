// Shared M3 components. Class strings are copied from the board helpers in
// docs/design/board.html (exported to docs/design/board-A/*.html); keep them in sync with the board.
import type { ReactNode, ButtonHTMLAttributes, InputHTMLAttributes } from 'react'
import { Link } from 'react-router'

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ')

export function Icon({ name, size, fill, className }: { name: string; size?: number; fill?: boolean; className?: string }) {
  return (
    <span className={cx('ms', fill && 'fill', className)} style={size ? { fontSize: size } : undefined} aria-hidden="true">
      {name}
    </span>
  )
}

/* ---------- Buttons ---------- */

type Variant = 'filled' | 'tonal' | 'outlined' | 'text'
const VARIANT: Record<Variant, string> = {
  filled: 'bg-cta text-on-cta',
  tonal: 'bg-secondary-container text-on-secondary-container',
  outlined: 'border border-outline text-primary',
  text: 'text-primary !px-3',
}
const SIZE = { l: 'h-14 px-7 text-title-m gap-2.5', m: 'h-10 px-6 text-label-l gap-2' }

type ButtonProps = {
  variant?: Variant
  size?: keyof typeof SIZE
  full?: boolean
  icon?: string
  to?: string
  children: ReactNode
} & ButtonHTMLAttributes<HTMLButtonElement>

export function Button({ variant = 'filled', size = 'm', full, icon, to, children, className, ...rest }: ButtonProps) {
  const cls = cx(
    'sl relative inline-flex items-center justify-center font-semibold rounded-full disabled:opacity-40',
    SIZE[size],
    VARIANT[variant],
    full && 'w-full',
    className,
  )
  const body = (
    <>
      {icon && <Icon name={icon} size={20} />}
      <span>{children}</span>
    </>
  )
  if (to) return <Link to={to} className={cls}>{body}</Link>
  return <button type="button" className={cls} {...rest}>{body}</button>
}

export function IconButton({ icon, label, to, onClick }: { icon: string; label: string; to?: string; onClick?: () => void }) {
  const cls = 'sl relative grid h-12 w-12 shrink-0 place-items-center rounded-full'
  if (to) return <Link to={to} aria-label={label} className={cls}><Icon name={icon} /></Link>
  return <button type="button" aria-label={label} onClick={onClick} className={cls}><Icon name={icon} /></button>
}

export function Fab({ icon, children, onClick, to }: { icon: string; children: ReactNode; onClick?: () => void; to?: string }) {
  const cls = 'sl relative pointer-events-auto flex h-14 items-center gap-3 rounded-[16px] bg-cta pl-4 pr-5 text-label-l font-bold text-on-cta shadow-3'
  const body = <><Icon name={icon} />{children}</>
  return to ? <Link to={to} className={cls}>{body}</Link> : <button type="button" onClick={onClick} className={cls}>{body}</button>
}

/* ---------- Chips ---------- */

export function Chip({ selected, children, onClick, icon }: { selected?: boolean; children: ReactNode; onClick?: () => void; icon?: string }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cx(
        'sl relative inline-flex h-8 shrink-0 items-center gap-1.5 rounded-[8px] px-3 text-label-l font-semibold',
        selected ? 'bg-secondary-container text-on-secondary-container' : 'border border-outline text-on-surface-variant',
      )}
    >
      {(selected || icon) && <Icon name={selected ? 'check' : icon!} size={18} />}
      {children}
    </button>
  )
}

export type Status = 'pending' | 'settled' | 'failed' | 'flagged'
const STATUS: Record<Status, { cls: string; icon: string; word: string }> = {
  pending: { cls: 'bg-tertiary-container text-on-tertiary-container', icon: 'schedule', word: 'Pending' },
  settled: { cls: 'bg-success-container text-on-success-container', icon: 'check_circle', word: 'Settled' },
  failed: { cls: 'bg-error-container text-on-error-container', icon: 'cancel', word: 'Failed' },
  flagged: { cls: 'bg-error-container text-on-error-container', icon: 'flag', word: 'Flagged' },
}

export function StatusChip({ status }: { status: Status }) {
  const s = STATUS[status]
  return (
    <span className={cx('inline-flex h-7 shrink-0 items-center gap-1 rounded-[8px] pl-1.5 pr-2.5 text-label-m font-bold', s.cls)}>
      <Icon name={s.icon} size={18} fill />
      {s.word}
    </span>
  )
}

export function NetChip({ online }: { online: boolean }) {
  return (
    <span
      className={cx(
        'inline-flex h-8 items-center gap-1.5 rounded-[8px] px-2.5 text-label-l font-semibold',
        online ? 'bg-success-container text-on-success-container' : 'bg-warning-container text-on-warning-container',
      )}
    >
      <Icon name={online ? 'cloud_done' : 'cloud_off'} size={18} />
      {online ? 'Online' : 'Offline'}
    </span>
  )
}

/** Required on every sample name, stall, transaction and stat until real data exists (design brief rule 11). */
export function SampleTag() {
  return (
    <span className="inline-flex h-5 items-center rounded-[4px] border border-dashed border-outline px-1.5 text-label-s font-semibold text-on-surface-variant align-middle">
      Sample
    </span>
  )
}

/* ---------- App frame ---------- */

export function TopBar({ title, back, actions }: { title: ReactNode; back?: string | (() => void); actions?: ReactNode }) {
  return (
    <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center gap-1 px-1 bg-surface text-on-surface">
      {back === undefined ? (
        <span className="w-3" />
      ) : typeof back === 'string' ? (
        <IconButton icon="arrow_back" label="Back" to={back} />
      ) : (
        <IconButton icon="arrow_back" label="Back" onClick={back} />
      )}
      <h1 className="min-w-0 flex-1 truncate px-1 font-display text-title-l font-semibold">{title}</h1>
      <div className="flex items-center gap-1 pr-2">{actions}</div>
    </header>
  )
}

export type NavItem = { to: string; icon: string; label: string }

/** Navigation bar under 600 px, navigation rail from 600 px (design brief rule 1). */
export function NavBar({ items, active }: { items: NavItem[]; active: string }) {
  return (
    <>
      <nav
        aria-label="Main"
        className="sticky bottom-0 z-20 mt-auto grid h-20 bg-surface-container medium:hidden"
        style={{ gridTemplateColumns: `repeat(${items.length},minmax(0,1fr))` }}
      >
        {items.map((it) => {
          const on = it.to === active
          return (
            <Link key={it.to} to={it.to} aria-current={on ? 'page' : undefined} className="flex flex-col items-center justify-center gap-1 pt-3 pb-4">
              <span className={cx('grid h-8 w-16 place-items-center rounded-full', on ? 'bg-secondary-container text-on-secondary-container' : 'text-on-surface-variant')}>
                <Icon name={it.icon} fill={on} />
              </span>
              <span className={cx('text-label-m font-semibold', on ? 'text-on-surface' : 'text-on-surface-variant')}>{it.label}</span>
            </Link>
          )
        })}
      </nav>
      <nav aria-label="Main" className="fixed inset-y-0 left-0 z-20 hidden w-20 flex-col items-center gap-3 bg-surface-container pt-6 medium:flex">
        {items.map((it) => {
          const on = it.to === active
          return (
            <Link key={it.to} to={it.to} aria-current={on ? 'page' : undefined} className="flex w-20 flex-col items-center gap-1">
              <span className={cx('grid h-8 w-14 place-items-center rounded-full', on ? 'bg-secondary-container text-on-secondary-container' : 'text-on-surface-variant')}>
                <Icon name={it.icon} fill={on} />
              </span>
              <span className={cx('text-label-m font-semibold', on ? 'text-on-surface' : 'text-on-surface-variant')}>{it.label}</span>
            </Link>
          )
        })}
      </nav>
    </>
  )
}

/** The 600 px app column. `rail` adds the left padding the navigation rail needs from 600 px. */
export function AppColumn({ rail, children }: { rail?: boolean; children: ReactNode }) {
  return (
    <div className={cx('min-h-screen', rail && 'medium:pl-20')}>
      <div className="appcol relative mx-auto flex min-h-screen w-full max-w-[600px] flex-col expanded:border-x expanded:border-outline-variant">
        {children}
      </div>
    </div>
  )
}

/* ---------- Content ---------- */

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('rounded-[12px] bg-surface-container-low p-4', className)}>{children}</div>
}

export function Avatar({ icon, tone = 'secondary' }: { icon: string; tone?: 'secondary' | 'tertiary' | 'error' | 'success' }) {
  const t = {
    secondary: 'bg-secondary-container text-on-secondary-container',
    tertiary: 'bg-tertiary-container text-on-tertiary-container',
    error: 'bg-error-container text-on-error-container',
    success: 'bg-success-container text-on-success-container',
  }[tone]
  return (
    <span className={cx('grid h-10 w-10 shrink-0 place-items-center rounded-full', t)}>
      <Icon name={icon} size={22} />
    </span>
  )
}

export function ListItem({
  lead,
  headline,
  support,
  trail,
  to,
  onClick,
}: {
  lead?: ReactNode
  headline: ReactNode
  support?: ReactNode
  trail?: ReactNode
  to?: string
  onClick?: () => void
}) {
  const cls = cx('flex w-full min-h-[72px] items-center gap-4 px-4 py-2 text-left', (to || onClick) && 'sl relative')
  const body = (
    <>
      {lead}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-body-l text-on-surface">{headline}</span>
        {support && <span className="block truncate text-body-m text-on-surface-variant">{support}</span>}
      </span>
      {trail}
    </>
  )
  if (to) return <Link to={to} className={cls}>{body}</Link>
  if (onClick) return <button type="button" onClick={onClick} className={cls}>{body}</button>
  return <div className={cls}>{body}</div>
}

export function List({ children }: { children: ReactNode }) {
  return <div className="-mx-4 divide-y divide-outline-variant">{children}</div>
}

type BannerTone = 'warning' | 'error' | 'tertiary' | 'success'
const BANNER: Record<BannerTone, string> = {
  warning: 'bg-warning-container text-on-warning-container',
  error: 'bg-error-container text-on-error-container',
  tertiary: 'bg-tertiary-container text-on-tertiary-container',
  success: 'bg-success-container text-on-success-container',
}

export function Banner({ tone, icon, title, children, action }: { tone: BannerTone; icon: string; title: ReactNode; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className={cx('flex gap-3 rounded-[12px] p-4', action ? 'items-center' : undefined, BANNER[tone])}>
      <Icon name={icon} />
      <div className="flex-1">
        <p className="text-title-s font-semibold">{title}</p>
        {children && <p className={action ? 'text-body-s' : 'text-body-m'}>{children}</p>}
      </div>
      {action}
    </div>
  )
}

export function EmptyState({ icon, title, children }: { icon: string; title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-[12px] border border-dashed border-outline-variant p-6 text-center">
      <span className="text-on-surface-variant"><Icon name={icon} size={40} /></span>
      <p className="text-title-m font-semibold">{title}</p>
      <p className="max-w-[32ch] text-body-m text-on-surface-variant">{children}</p>
    </div>
  )
}

/** M3 filled text field. Board bug fixed: the board's `rounded-[4px 4px 0 0]` is not a valid class, so it renders square. */
export function TextField({ label, id, mono, ...input }: { label: string; id: string; mono?: boolean } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label htmlFor={id} className="block">
      <span className="relative flex h-14 items-end gap-3 rounded-t-[4px] border-b border-on-surface-variant bg-surface-container-highest px-4 pb-2 focus-within:border-b-2 focus-within:border-primary">
        <span className="min-w-0 flex-1">
          <span className="block text-body-s text-on-surface-variant">{label}</span>
          <input id={id} className={cx('w-full bg-transparent text-body-l text-on-surface outline-none', mono && 'font-mono')} {...input} />
        </span>
      </span>
    </label>
  )
}

/* ---------- Dialog and snackbar ---------- */

export function Dialog({ icon, title, children, actions }: { icon: string; title: string; children: ReactNode; actions: ReactNode }) {
  return (
    <div className="absolute inset-0 z-40 grid place-items-center p-6 scrim">
      <div role="alertdialog" aria-modal="true" aria-labelledby="dlg-t" className="w-full min-w-[280px] max-w-[560px] rounded-[28px] bg-surface-container-high p-6 text-center shadow-3">
        <span className="text-secondary"><Icon name={icon} size={24} /></span>
        <h2 id="dlg-t" className="mt-4 font-display text-headline-s font-semibold text-on-surface">{title}</h2>
        <p className="mt-4 text-left text-body-m text-on-surface-variant">{children}</p>
        <div className="mt-6 flex justify-end gap-2">{actions}</div>
      </div>
    </div>
  )
}

export function Snackbar({ icon, children, action }: { icon?: string; children: ReactNode; action?: ReactNode }) {
  return (
    <div role="status" className="snack pointer-events-auto flex min-h-12 items-center gap-2 rounded-[4px] bg-inverse-surface py-1.5 pl-4 pr-2 text-body-m text-inverse-on-surface shadow-3">
      {icon && <Icon name={icon} size={20} fill />}
      <span className="flex-1">{children}</span>
      {action}
    </div>
  )
}

/* ---------- Keypad ---------- */

const KEY = 'sl relative h-16 rounded-[12px] bg-surface-container-high font-display text-headline-s font-medium'

/** Peso keypad (Charge) or PIN pad. `onKey` gets a digit, 'C' or 'backspace'. */
export function Keypad({ mode, onKey }: { mode: 'amount' | 'pin'; onKey: (k: string) => void }) {
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', mode === 'amount' ? 'C' : '', '0', 'backspace']
  return (
    <div className="grid grid-cols-3 gap-2">
      {keys.map((k) =>
        k === '' ? (
          <span key="blank" />
        ) : (
          <button
            key={k}
            type="button"
            onClick={() => onKey(k)}
            aria-label={k === 'backspace' ? 'Delete' : k === 'C' ? 'Clear' : mode === 'pin' ? `Digit ${k}` : k}
            className={KEY}
          >
            {k === 'backspace' ? <Icon name="backspace" /> : k}
          </button>
        ),
      )}
    </div>
  )
}

// More shared pieces from the board helpers: language toggle, wordmark, legal dialog,
// money list rows, FAB and snackbar docks.
import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react'
import { Link } from 'react-router'
import { Icon, StatusChip, type Status } from './index'

/* ---------- Language (EN/FIL). Copy is English until the Filipino review is done. ---------- */

type Lang = 'en' | 'fil'
const LANG_KEY = 'heronpay.lang'
const listeners = new Set<() => void>()
const readLang = (): Lang => {
  try {
    return localStorage.getItem(LANG_KEY) === 'fil' ? 'fil' : 'en'
  } catch {
    return 'en'
  }
}
export function setLang(l: Lang) {
  try {
    localStorage.setItem(LANG_KEY, l)
  } catch {
    /* private mode: keep the default */
  }
  document.documentElement.lang = l === 'fil' ? 'fil' : 'en'
  listeners.forEach((f) => f())
}
export const useLang = () =>
  useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    readLang,
  )

export function LangToggle() {
  const lang = useLang()
  const btn = (l: Lang, label: string) => (
    <button
      type="button"
      aria-pressed={lang === l}
      onClick={() => setLang(l)}
      className={`h-8 min-w-[44px] rounded-full px-2 text-label-l font-bold ${lang === l ? 'bg-secondary-container text-on-secondary-container' : 'opacity-80'}`}
    >
      {label}
    </button>
  )
  return (
    <span className="inline-flex items-center gap-0.5 rounded-full border border-outline-variant p-0.5" role="group" aria-label="Language">
      {btn('en', 'EN')}
      {btn('fil', 'FIL')}
    </span>
  )
}

/* ---------- Wordmark ---------- */

export function Wordmark({ size = 'headline' }: { size?: 'headline' | 'title' }) {
  return (
    <span className={`inline-flex items-center gap-2 font-display font-bold tracking-[-0.02em] ${size === 'headline' ? 'text-headline-s' : 'text-title-l'}`}>
      <span className="grid h-8 w-8 place-items-center rounded-[10px] bg-cta text-on-cta">
        <Icon name="contactless" size={20} />
      </span>
      HeronPay
    </span>
  )
}

/* ---------- Legal outlines (from the board; full text is owed by the owner) ---------- */

export const LEGAL = {
  privacy: ['Privacy notice (outline)', [
    'Who we are: the HeronPay hackathon team. Contact: team email (placeholder).',
    'What we collect: student number, full name, a SHA-256 hash of the ID chip UID, a hash of the PIN (never the PIN), and receipts (amount, stall, time).',
    'Why: to load credits, accept payments, settle them, set offline limits and detect cloned IDs.',
    'On-chain: settled payments are public and permanent on Polygon Amoy. They show wallet addresses and amounts, not names.',
    'AI: receipts are scored for offline limits and fraud. The assistant sends your receipts to an AI service only when you ask it something.',
    'How long: until the demo ends (placeholder, team to confirm).',
    'Your rights under the Data Privacy Act of 2012 (RA 10173): access, correction, and deletion of off-chain data.',
  ]],
  terms: ['Terms of use (outline)', [
    'TagakPeso (tPHP) is a testnet token with no cash value. There is no cash-out.',
    'The demo may be reset at any time.',
    'A payment accepted offline can fail at settlement if the balance is short.',
    'Keep your PIN private. Report a lost ID to the cashier.',
    'Not affiliated with or endorsed by the University of Makati.',
  ]],
  data: ['Data requests (outline)', [
    'Email the team (placeholder address) with your student number.',
    'We can show, correct, or delete your off-chain record: name, student number, hashes, receipts.',
    'Settled payments on the blockchain cannot be deleted. Deleting your record unlinks your name from that address.',
  ]],
  cookies: ['Cookies and storage (outline)', [
    'Essential storage only: your login on this phone, the offline receipt queue, and the cached student list on stall phones.',
    'No analytics or advertising cookies, so there is no cookie banner. If analytics is added later, a consent bar with Accept, Reject and Customize comes with it.',
  ]],
  disclaimer: ['Disclaimer (outline)', [
    'HeronPay is a student hackathon project and is not affiliated with or endorsed by the University of Makati.',
    'Testnet only. No real money moves.',
    'A real pilot needs university approval and BSP review.',
  ]],
  team: ['About the team (placeholder)', [
    'Four builders: contract, API and AI, stall POS, cashier and student screens. Names to be added by the team.',
  ]],
} as const satisfies Record<string, readonly [string, readonly string[]]>

export type LegalKey = keyof typeof LEGAL

export function LegalDialog({ which, onClose }: { which: LegalKey; onClose: () => void }) {
  const [title, items] = LEGAL[which]
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', k)
    return () => document.removeEventListener('keydown', k)
  }, [onClose])
  return (
    <div className="fixed inset-0 z-[60] grid place-items-center p-4 scrim" role="dialog" aria-modal="true" aria-labelledby="lg-h" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="max-h-[80vh] w-full max-w-[560px] overflow-auto rounded-[28px] bg-surface-container-high p-6 shadow-3">
        <div className="flex items-start justify-between gap-4">
          <h2 id="lg-h" className="font-display text-headline-s font-semibold">{title}</h2>
          <button type="button" autoFocus onClick={onClose} className="grid h-12 w-12 shrink-0 place-items-center rounded-full" aria-label="Close">
            <Icon name="close" />
          </button>
        </div>
        <ul className="mt-2 list-disc space-y-2 pl-5 text-body-m text-on-surface-variant">
          {items.map((x) => <li key={x}>{x}</li>)}
        </ul>
        <p className="mt-4 text-body-s text-on-surface-variant">Outline only. Full text is owed before launch.</p>
      </div>
    </div>
  )
}

/** An inline link that opens a legal outline. */
export function LegalLink({ which, children, className }: { which: LegalKey; children: ReactNode; className?: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <a
        href="#"
        onClick={(e) => {
          e.preventDefault()
          setOpen(true)
        }}
        className={className ?? 'font-semibold text-primary underline underline-offset-4'}
      >
        {children}
      </a>
      {open && <LegalDialog which={which} onClose={() => setOpen(false)} />}
    </>
  )
}

/* ---------- Money row (student lists) ---------- */

const AVATAR_TONE = {
  secondary: 'bg-secondary-container text-on-secondary-container',
  success: 'bg-success-container text-on-success-container',
  error: 'bg-error-container text-on-error-container',
} as const

export function MoneyItem({
  icon,
  tone,
  title,
  when,
  amount,
  credit,
  status,
  to,
}: {
  icon: string
  tone: keyof typeof AVATAR_TONE
  title: string
  when: string
  amount: string
  credit?: boolean
  status: Status
  to: string
}) {
  return (
    <Link to={to} className="sl relative flex w-full min-h-[72px] items-center gap-4 px-4 py-2 text-left">
      <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${AVATAR_TONE[tone]}`}>
        <Icon name={icon} size={22} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-body-l text-on-surface">{title}</span>
        <span className="block truncate text-body-m text-on-surface-variant">{when}</span>
      </span>
      <span className="flex flex-col items-end gap-1">
        <span className={`text-title-m font-semibold tabular-nums ${credit ? 'text-success' : ''}`}>{amount}</span>
        <StatusChip status={status} />
      </span>
    </Link>
  )
}

/* ---------- Docks above the navigation bar ---------- */

export function FabDock({ children }: { children: ReactNode }) {
  return <div className="pointer-events-none sticky bottom-24 z-30 -mt-14 flex justify-end px-4 medium:bottom-6">{children}</div>
}

export function SnackDock({ children }: { children: ReactNode }) {
  return <div className="pointer-events-none sticky bottom-24 z-30 px-4 pt-2 medium:bottom-6">{children}</div>
}

/** Tappable settings-style row (Profile). Same look as ListItem with an avatar and an optional chevron. */
export function RowButton({ icon, title, support, chevron, onClick, trail }: { icon: string; title: string; support: string; chevron?: boolean; onClick?: () => void; trail?: ReactNode }) {
  const body = (
    <>
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-secondary-container text-on-secondary-container">
        <Icon name={icon} size={22} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-body-l text-on-surface">{title}</span>
        <span className="block truncate text-body-m text-on-surface-variant">{support}</span>
      </span>
      {trail}
      {chevron && <span className="text-on-surface-variant"><Icon name="chevron_right" /></span>}
    </>
  )
  const cls = 'flex w-full min-h-[72px] items-center gap-4 px-4 py-2 text-left'
  return onClick ? <button type="button" onClick={onClick} className={`sl relative ${cls}`}>{body}</button> : <div className={cls}>{body}</div>
}

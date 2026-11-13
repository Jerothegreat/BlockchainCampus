// /app, to docs/design/board-A/app.html: who is using this phone. The pick is remembered.
import { useEffect } from 'react'
import { Link, useNavigate } from 'react-router'
import { NETWORK } from './lib/chain'
import { useOnline } from './lib/hooks'
import { AppColumn, Icon, NetChip, TopBar } from './ui'

const KEY = 'umakpay.role'
const ROLES = [
  { to: '/cashier', icon: 'badge', title: 'Cashier', text: 'Link IDs and load cash' },
  { to: '/pos', icon: 'storefront', title: 'Stall', text: 'Take payments, works offline' },
  { to: '/me', icon: 'wallet', title: 'Student', text: 'Register, top up, see receipts' },
]

const remember = (to: string) => {
  try {
    localStorage.setItem(KEY, to)
  } catch {
    // storage off: no remembered role
  }
}

/** `/`: jump to the remembered role, else the picker. */
export function Home() {
  const navigate = useNavigate()
  useEffect(() => {
    let to = '/app'
    try {
      to = localStorage.getItem(KEY) ?? '/app'
    } catch {
      // ignore
    }
    navigate(to, { replace: true })
  }, [navigate])
  return null
}

export function RolePicker() {
  const online = useOnline()
  return (
    <AppColumn>
      <TopBar title="UMak Pay" />
      <div className="flex flex-1 flex-col gap-4 px-4 py-6">
        <h2 className="font-display text-headline-s font-semibold">Who is using this phone?</h2>
        <div className="divide-y divide-outline-variant overflow-hidden rounded-[12px] bg-surface-container-low">
          {ROLES.map((r) => (
            <Link key={r.to} to={r.to} onClick={() => remember(r.to)} className="sl relative flex w-full min-h-[72px] items-center gap-4 px-4 py-2 text-left">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-[8px] bg-secondary-container text-on-secondary-container">
                <Icon name={r.icon} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-display text-title-m font-semibold text-on-surface">{r.title}</span>
                <span className="block truncate text-body-m text-on-surface-variant">{r.text}</span>
              </span>
              <span className="text-on-surface-variant"><Icon name="chevron_right" /></span>
            </Link>
          ))}
        </div>
        <p className="mt-auto flex flex-wrap items-center gap-3 text-body-m text-on-surface-variant">
          <NetChip online={online} /> {NETWORK}. This phone remembers your pick.
        </p>
      </div>
    </AppColumn>
  )
}

import Cashier from './pages/Cashier'
import ChipCheck from './pages/ChipCheck'

// Three screens, one PWA. Plain path switch: the PWA service worker serves index.html for every route.
const routes: Record<string, { title: string; page: () => React.JSX.Element }> = {
  '/cashier': { title: 'Cashier', page: Cashier },
  '/chip-check': { title: 'ID chip check', page: ChipCheck },
}

export default function App() {
  const route = routes[window.location.pathname.replace(/\/$/, '')]
  if (route) return <route.page />

  return (
    <main className="mx-auto min-h-dvh max-w-md bg-slate-50 p-4 text-slate-900">
      <h1 className="text-xl font-bold">UMak Pay</h1>
      <nav className="mt-4 grid gap-2">
        {Object.entries(routes).map(([path, { title }]) => (
          <a key={path} href={path} className="rounded-xl bg-white p-4 font-semibold shadow-sm">
            {title}
          </a>
        ))}
      </nav>
    </main>
  )
}

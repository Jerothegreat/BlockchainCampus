// Virtual cards for demos on a laptop or a phone without NFC. They live in this browser's IndexedDB,
// so /cashier, /pos and /me opened in tabs of the same browser all see the same cards.
import { newVirtualCard } from '../hooks/useCard'
import { db, type VirtualCard } from '../lib/db'
import { useLive } from '../lib/hooks'
import { Button, Chip } from './index'

export function DemoCards({ onTap, allowNew }: { onTap: (uid: string) => void; allowNew?: boolean }) {
  const cards = useLive(() => db.virtualCards.toArray(), [], [] as VirtualCard[])
  const create = async () => onTap(await newVirtualCard(`Demo ID ${cards.length + 1}`))
  if (cards.length === 0 && !allowNew) return null
  return (
    <div className="rounded-[12px] border border-dashed border-outline-variant p-3">
      <p className="text-label-l text-on-surface-variant">No NFC? Tap a demo ID kept in this browser</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {cards.map((c) => (
          <Chip key={c.uid} icon={c.card ? 'badge' : 'add_card'} onClick={() => onTap(c.uid)}>
            {c.label}
          </Chip>
        ))}
      </div>
      {allowNew && (
        <Button variant="text" icon="add_card" className="mt-1" onClick={() => void create()}>
          New blank demo ID
        </Button>
      )}
    </div>
  )
}

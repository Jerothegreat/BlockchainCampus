// "Hold the ID to save": writes a record the API returned onto the tapped card. The operation is
// only done once the card carries the new record, so this step owns its own retry.
import { useEffect, useRef, useState } from 'react'
import type { Hex } from 'viem'
import type { CardTap } from '../hooks/useCard'
import { Banner, Button, Icon } from './index'

export function CardWriter({
  tap,
  card,
  write,
  onDone,
}: {
  tap: CardTap
  card: Hex
  write: (tap: CardTap, card: Hex) => Promise<void>
  onDone: () => void
}) {
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const started = useRef(false)

  const run = async () => {
    setBusy(true)
    setError(null)
    try {
      await write(tap, card)
      onDone()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    if (started.current) return
    started.current = true
    void run()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex flex-col items-center gap-5 py-10 text-center">
      <div className="relative grid h-44 w-44 place-items-center rounded-full bg-surface-container-high text-primary">
        {busy && <span className="nfc-ring absolute inset-0 rounded-full border-2 border-primary" />}
        <Icon name="contactless" size={72} />
      </div>
      <p className="font-display text-headline-s font-semibold">{tap.virtual ? 'Saving to the demo ID' : 'Keep the ID on the phone'}</p>
      <p className="max-w-[32ch] text-body-l text-on-surface-variant">
        Saving the new wallet record to the card. Don't move it until the phone buzzes.
      </p>
      {error && (
        <div className="w-full space-y-3 text-left">
          <Banner tone="error" icon="error" title="Card not saved yet">
            {error} The change is safe on-chain; hold the same ID to the phone and try again.
          </Banner>
          <Button size="l" full icon="contactless" disabled={busy} onClick={() => void run()}>
            Try again
          </Button>
        </div>
      )}
    </div>
  )
}

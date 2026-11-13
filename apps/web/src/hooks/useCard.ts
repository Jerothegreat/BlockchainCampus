// One way to read and write a wallet card, whether it is a real NFC ID or a virtual card kept in
// this browser (laptop demo, no NFC). Every screen that touches a card goes through this hook.
import { useCallback, useRef } from 'react'
import { bytesToHex, hexToBytes, type Hex } from 'viem'
import { CARD_MIME } from '../lib/card'
import { db } from '../lib/db'
import { hashUid, normalizeUid } from '../lib/uid'
import { useNfc } from './useNfc'

export type CardTap = {
  uid: string // normalized hex
  uidHash: string
  /** Wallet record read from the card; null can also mean a registered ID needs recovery. */
  card: Hex | null
  virtual: boolean
}

export function useCard(onTap: (tap: CardTap) => void) {
  const onTapRef = useRef(onTap)
  onTapRef.current = onTap

  const nfc = useNfc((t) => {
    const rec = t.records.find((r) => r.recordType === 'mime' && r.mediaType === CARD_MIME)
    onTapRef.current({ uid: t.uid, uidHash: t.uidHash, card: rec && rec.bytes.length ? bytesToHex(rec.bytes) : null, virtual: false })
  })

  /** Tap a virtual card by uid (the "Demo card" buttons). */
  const tapVirtual = useCallback(async (uid: string) => {
    const v = await db.virtualCards.get(uid)
    onTapRef.current({ uid, uidHash: await hashUid(uid), card: v?.card ?? null, virtual: true })
  }, [])

  /** Saves a new record to the card that was tapped. For an NFC ID the student must hold it to the phone. */
  const write = useCallback(
    async (tap: CardTap, card: Hex) => {
      if (tap.virtual) await db.virtualCards.update(tap.uid, { card })
      else await nfc.write(CARD_MIME, hexToBytes(card))
    },
    [nfc.write], // eslint-disable-line react-hooks/exhaustive-deps
  )

  return { nfc, tapVirtual, write, start: nfc.startScan, stop: nfc.stopScan }
}

/** A new blank virtual card with a random 7-byte UID (like an NTAG chip). */
export async function newVirtualCard(label: string) {
  const uid = normalizeUid([...crypto.getRandomValues(new Uint8Array(7))].map((b) => b.toString(16).padStart(2, '0')).join(''))
  await db.virtualCards.put({ uid, card: null, label })
  return uid
}

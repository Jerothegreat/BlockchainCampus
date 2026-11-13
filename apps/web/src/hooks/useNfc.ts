import { useCallback, useRef, useState } from 'react'
import { hashUid, normalizeUid } from '../lib/uid'

export type NfcRecord = { recordType: string; mediaType?: string; data: string }
export type NfcTap = {
  serialNumber: string // raw from Web NFC, e.g. "04:a2:1b:7c"
  uid: string // normalized hex
  uidHash: string // SHA-256(uid), what the backend/snapshot stores
  records: NfcRecord[]
  at: number
}

// Web NFC: Chrome on Android only, HTTPS (or localhost), scan must start from a user gesture.
export const isNfcSupported = typeof window !== 'undefined' && 'NDEFReader' in window

export function useNfc(onTap?: (tap: NfcTap) => void) {
  const [scanning, setScanning] = useState(false)
  const [lastTap, setLastTap] = useState<NfcTap | null>(null)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const onTapRef = useRef(onTap)
  onTapRef.current = onTap

  const startScan = useCallback(async () => {
    if (!isNfcSupported) {
      setError('Web NFC not supported. Use Chrome on Android over HTTPS.')
      return
    }
    setError(null)
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    controller.signal.addEventListener('abort', () => setScanning(false))

    try {
      const reader = new NDEFReader()
      reader.onreadingerror = () =>
        setError('Card detected but could not be read. This chip may not be supported by this phone.')
      reader.onreading = async (event) => {
        if (!event.serialNumber) {
          setError('Card read but no UID returned.')
          return
        }
        const decoder = new TextDecoder()
        const tap: NfcTap = {
          serialNumber: event.serialNumber,
          uid: normalizeUid(event.serialNumber),
          uidHash: await hashUid(event.serialNumber),
          records: event.message.records.map((r) => ({
            recordType: r.recordType,
            mediaType: r.mediaType,
            data: r.data ? decoder.decode(r.data) : '',
          })),
          at: Date.now(),
        }
        setError(null)
        setLastTap(tap)
        onTapRef.current?.(tap)
      }
      await reader.scan({ signal: controller.signal })
      setScanning(true)
    } catch (e) {
      const err = e as DOMException
      setError(err.name === 'NotAllowedError' ? 'NFC permission denied.' : err.message)
      setScanning(false)
    }
  }, [])

  const stopScan = useCallback(() => abortRef.current?.abort(), [])

  return { isSupported: isNfcSupported, scanning, lastTap, error, startScan, stopScan }
}

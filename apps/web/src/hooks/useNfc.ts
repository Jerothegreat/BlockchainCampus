import { useCallback, useRef, useState } from 'react'
import { hashUid, normalizeUid } from '../lib/uid'

export type NfcRecord = { recordType: string; mediaType?: string; data: string; bytes: Uint8Array }
export type NfcTap = {
  serialNumber: string // raw from Web NFC, e.g. "04:a2:1b:7c"
  uid: string // normalized hex
  uidHash: string // SHA-256(uid), what the backend/snapshot stores
  records: NfcRecord[]
  at: number
}

// Web NFC: Chrome on Android only, HTTPS (or localhost), scan must start from a user gesture.
export const isNfcSupported = typeof window !== 'undefined' && 'NDEFReader' in window

const WRITE_TIMEOUT_MS = 30_000

export function useNfc(onTap?: (tap: NfcTap) => void) {
  const [scanning, setScanning] = useState(false)
  const [writing, setWriting] = useState(false)
  const [lastTap, setLastTap] = useState<NfcTap | null>(null)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const writingRef = useRef(false)
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
        if (writingRef.current) return // the same card, held for a write: not a new tap
        if (!event.serialNumber) {
          setError('Card read but no UID returned.')
          return
        }
        const decoder = new TextDecoder()
        const tap: NfcTap = {
          serialNumber: event.serialNumber,
          uid: normalizeUid(event.serialNumber),
          uidHash: await hashUid(event.serialNumber),
          records: event.message.records.map((r) => {
            const bytes = r.data ? new Uint8Array(r.data.buffer, r.data.byteOffset, r.data.byteLength) : new Uint8Array()
            return { recordType: r.recordType, mediaType: r.mediaType, data: r.data ? decoder.decode(r.data) : '', bytes }
          }),
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

  /** Writes one mime record to the next card in range (waits up to 30 s). Throws on failure. */
  const write = useCallback(async (mediaType: string, data: Uint8Array) => {
    if (!isNfcSupported) throw new Error('Web NFC not supported.')
    const signal = AbortSignal.timeout(WRITE_TIMEOUT_MS)
    writingRef.current = true
    setWriting(true)
    try {
      await new NDEFReader().write({ records: [{ recordType: 'mime', mediaType, data: new Uint8Array(data) }] }, { overwrite: true, signal })
    } catch (e) {
      const err = e as DOMException
      throw new Error(err.name === 'TimeoutError' || err.name === 'AbortError' ? 'No card held to the phone.' : err.message)
    } finally {
      // Ignore the reading the write itself triggers.
      setTimeout(() => (writingRef.current = false), 1500)
      setWriting(false)
    }
  }, [])

  return { isSupported: isNfcSupported, scanning, writing, lastTap, error, startScan, stopScan, write }
}

import { useCallback, useState } from 'react'

const STORAGE_KEY = 'umakpay.cashierKey'

function read(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? ''
  } catch {
    return ''
  }
}

/** Shared secret for cashier-only API routes, remembered on this device. */
export function useCashierKey() {
  const [key, setKeyState] = useState(read)
  const setKey = useCallback((value: string) => {
    setKeyState(value)
    try {
      if (value) localStorage.setItem(STORAGE_KEY, value)
      else localStorage.removeItem(STORAGE_KEY)
    } catch {
      // storage unavailable: key lives for this session only
    }
  }, [])
  return [key, setKey] as const
}

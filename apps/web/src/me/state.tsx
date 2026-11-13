// /me state: which student this phone belongs to (remembered after the first tap), their history,
// and the card reader. The ID itself is the login: tapping it proves the card is here (API rule 3).
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Address } from 'viem'
import { api, type History } from '../lib/api'
import { db, getMeta, setMeta } from '../lib/db'
import { useLive, useOnline } from '../lib/hooks'
import { useCard, type CardTap } from '../hooks/useCard'

export type MeLogin = { uidHash: string; address: Address; name: string; studentNo: string }

type Me = {
  online: boolean
  me: MeLogin | null | undefined // undefined = still loading
  history: History | null
  historyError: string | null
  reload: () => Promise<void>
  remember: (m: MeLogin) => Promise<void>
  logout: () => Promise<void>
  card: ReturnType<typeof useCard>
  /** The current screen's tap handler (screens register one while they wait for a tap). */
  setOnTap: (fn: ((t: CardTap) => void) | null) => void
}

const Ctx = createContext<Me | null>(null)
export const useMe = () => {
  const c = useContext(Ctx)
  if (!c) throw new Error('useMe outside MeProvider')
  return c
}

export function MeProvider({ children }: { children: ReactNode }) {
  const online = useOnline()
  const me = useLive(() => getMeta<MeLogin>('me').then((m) => m ?? null), [], undefined as MeLogin | null | undefined)
  const [history, setHistory] = useState<History | null>(null)
  const [historyError, setHistoryError] = useState<string | null>(null)
  const onTapRef = useRef<((t: CardTap) => void) | null>(null)
  const card = useCard((t) => onTapRef.current?.(t))

  const reload = useCallback(async () => {
    if (!me) return
    try {
      setHistory(await api.history(me.address))
      setHistoryError(null)
    } catch (e) {
      setHistoryError(e instanceof Error ? e.message : String(e))
    }
  }, [me])

  useEffect(() => {
    if (online) void reload()
  }, [online, reload])

  const value = useMemo<Me>(
    () => ({
      online,
      me,
      history,
      historyError,
      reload,
      remember: async (m) => {
        await setMeta('me', m)
      },
      logout: async () => {
        await db.meta.delete('me')
        setHistory(null)
      },
      card,
      setOnTap: (fn) => {
        onTapRef.current = fn
      },
    }),
    [online, me, history, historyError, reload, card],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

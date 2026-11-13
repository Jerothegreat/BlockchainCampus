import { useLang } from '../ui/more'
import { S } from './strings'

export type Key = keyof typeof S.en

/** Board copy in the current language; FIL falls back to EN (board rule). */
export function useT() {
  const lang = useLang()
  return (k: Key): string => (lang === 'fil' ? (S.fil as Partial<Record<Key, string>>)[k] : undefined) ?? S.en[k]
}

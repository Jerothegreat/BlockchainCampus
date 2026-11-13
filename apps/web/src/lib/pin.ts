// Offline PIN check on the POS (API.md "Offline PIN check"). Must match apps/api/src/pin.ts.
import type { SyncStudent } from './api'

const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
const fromHex = (h: string) => new Uint8Array(h.match(/../g)!.map((x) => parseInt(x, 16)))

export async function pinMatches(pin: string, uid: string, s: Pick<SyncStudent, 'pinHash' | 'pinSalt' | 'pinIter'>): Promise<boolean> {
  const utf8 = new TextEncoder()
  if (!s.pinSalt || !s.pinIter) {
    // Legacy verifier: sha256(pin + uid).
    return hex(await crypto.subtle.digest('SHA-256', utf8.encode(pin + uid))) === s.pinHash
  }
  const key = await crypto.subtle.importKey('raw', utf8.encode(pin), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: fromHex(s.pinSalt), iterations: s.pinIter }, key, 256)
  return hex(bits) === s.pinHash
}

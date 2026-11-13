// Web NFC gives serialNumber as "04:a2:1b:..." — normalize before hashing so the
// same card always yields the same uidHash (PRD §6.3: uidHash = SHA-256(uid)).
export function normalizeUid(serialNumber: string): string {
  return serialNumber.replace(/[^0-9a-f]/gi, '').toLowerCase()
}

export async function hashUid(serialNumber: string): Promise<string> {
  const bytes = new TextEncoder().encode(normalizeUid(serialNumber))
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

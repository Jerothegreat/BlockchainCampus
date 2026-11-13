import { pbkdf2Sync } from 'node:crypto'
import { verifyTypedData } from 'viem'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { describe, expect, it } from 'vitest'
import { cardIdOf, cardStateTypes, decodeCard, domainOf, encodeCard, receiptTypes, verifyCardState, type ChainInfo } from './card'
import { pinMatches } from './pin'

const signer = privateKeyToAccount(generatePrivateKey())
const chain: ChainInfo = { chainId: 97, contract: '0xBAa03A8Fb79e0A56A0A068CaB2A616CBb96Ea776', cardSigner: signer.address }
const cardId = cardIdOf('ab'.repeat(32))

async function issue(balance: number, nonce: number) {
  const s = { balance, nonce, issuedAt: 1_700_000_000 }
  const sig = await signer.signTypedData({ domain: domainOf(chain), types: cardStateTypes, primaryType: 'CardState', message: { cardId, balance: BigInt(balance), nonce, issuedAt: s.issuedAt } })
  return { ...s, sig }
}

describe('card record (apps/api/src/cardstate.ts layout)', () => {
  it('is 83 bytes clear and 200 bytes pending, and round-trips', async () => {
    const state = await issue(20000, 4)
    const clear = encodeCard({ state, pending: null })
    expect((clear.length - 2) / 2).toBe(83)
    expect(decodeCard(clear)).toEqual({ state, pending: null })
    const pending = { id: '8c0f7f2e-1d2b-4c3a-9e8f-0a1b2c3d4e5f', to: '0x2222222222222222222222222222222222222222' as const, amount: 8500, createdAt: 1_700_000_000_123, sig: state.sig }
    const full = encodeCard({ state, pending })
    expect((full.length - 2) / 2).toBe(200)
    expect(decodeCard(full)).toEqual({ state, pending })
  })

  it('rejects malformed bytes', () => {
    expect(decodeCard('0x00')).toBeNull()
    expect(decodeCard('nothex')).toBeNull()
  })

  it('verifies the backend signature and catches an edited balance', async () => {
    const state = await issue(20000, 4)
    expect(await verifyCardState(chain, cardId, state)).toBe(true)
    expect(await verifyCardState(chain, cardId, { ...state, balance: 9_999_999 })).toBe(false)
    expect(await verifyCardState(chain, cardIdOf('cd'.repeat(32)), state)).toBe(false) // copied to another card
  })

  it('receipt types match what the API verifies', async () => {
    const pos = privateKeyToAccount(generatePrivateKey())
    const message = { id: 'r1', cardId, to: '0x2222222222222222222222222222222222222222' as const, amount: 8500n, createdAt: 1n, cardNonce: 4 }
    const signature = await pos.signTypedData({ domain: domainOf(chain), types: receiptTypes, primaryType: 'Receipt', message })
    expect(await verifyTypedData({ address: pos.address, domain: domainOf(chain), types: receiptTypes, primaryType: 'Receipt', message, signature })).toBe(true)
  })
})

describe('pinMatches (apps/api/src/pin.ts)', () => {
  it('matches the PBKDF2 verifier the API stores', async () => {
    const salt = '0123456789abcdef0123456789abcdef'
    const pinHash = pbkdf2Sync('1234', Buffer.from(salt, 'hex'), 1000, 32, 'sha256').toString('hex')
    expect(await pinMatches('1234', 'de000001', { pinHash, pinSalt: salt, pinIter: 1000 })).toBe(true)
    expect(await pinMatches('1235', 'de000001', { pinHash, pinSalt: salt, pinIter: 1000 })).toBe(false)
  })
})

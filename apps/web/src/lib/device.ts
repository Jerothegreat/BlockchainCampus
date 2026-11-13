// The stall POS device key (API.md "Device key and auth"). Generated once, kept in IndexedDB.
// It signs /sync, /merchants/me and /merchants/withdraw requests and every offline receipt.
import type { Hex } from 'viem'
import { generatePrivateKey, privateKeyToAccount, type PrivateKeyAccount } from 'viem/accounts'
import type { SignedReceipt } from './api'
import { domainOf, receiptTypes, type ChainInfo } from './card'
import { getMeta, setMeta } from './db'

let cached: PrivateKeyAccount | null = null

export async function deviceAccount(): Promise<PrivateKeyAccount> {
  if (cached) return cached
  let key = await getMeta<Hex>('deviceKey')
  if (!key) {
    key = generatePrivateKey()
    await setMeta('deviceKey', key)
  }
  cached = privateKeyToAccount(key)
  return cached
}

export async function deviceHeaders(): Promise<Record<string, string>> {
  const account = await deviceAccount()
  const ts = Date.now()
  return {
    'x-device-address': account.address,
    'x-device-timestamp': String(ts),
    'x-device-signature': await account.signMessage({ message: `UMak Pay device auth ${ts}` }),
  }
}

/** Signs a card payment offline (EIP-712 Receipt, cardNonce = the nonce of the state read from the card). */
export async function signReceipt(chain: ChainInfo, r: Omit<SignedReceipt, 'sig'>): Promise<SignedReceipt> {
  const account = await deviceAccount()
  const sig = await account.signTypedData({
    domain: domainOf(chain),
    types: receiptTypes,
    primaryType: 'Receipt',
    message: { id: r.id, cardId: r.cardId, to: r.to, amount: BigInt(r.amount), createdAt: BigInt(r.createdAt), cardNonce: r.cardNonce },
  })
  return { ...r, sig }
}

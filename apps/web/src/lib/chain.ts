// Chain values from /health, cached so the POS can verify cards and sign receipts with no signal.
import { api } from './api'
import type { ChainInfo } from './card'
import { getMeta, setMeta } from './db'

export const EXPLORER_URL: string = import.meta.env.VITE_EXPLORER_URL ?? 'https://testnet.bscscan.com'
export const txUrl = (hash: string) => `${EXPLORER_URL}/tx/${hash}`
export const addressUrl = (address: string) => `${EXPLORER_URL}/address/${address}`
export const NETWORK = 'BNB Smart Chain Testnet'

/** Fresh from the API when online, else the cached copy. Null if this phone was never online. */
export async function chainInfo(): Promise<ChainInfo | null> {
  try {
    const h = await api.health()
    const info: ChainInfo = { chainId: h.chainId, contract: h.contract, cardSigner: h.cardSigner }
    await setMeta('chain', info)
    return info
  } catch {
    return (await getMeta<ChainInfo>('chain')) ?? null
  }
}

export const cachedChainInfo = () => getMeta<ChainInfo>('chain')

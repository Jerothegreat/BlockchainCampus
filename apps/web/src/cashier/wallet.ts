// Cashier wallet: wagmi on Polygon Amoy with MetaMask (the owner account mints TagakPeso).
import { QueryClient } from '@tanstack/react-query'
import { createConfig, http } from 'wagmi'
import { polygonAmoy } from 'wagmi/chains'
import { injected } from 'wagmi/connectors'

export const wagmiConfig = createConfig({
  chains: [polygonAmoy],
  // MetaMask on Android: open the page in MetaMask's browser, which injects the wallet.
  connectors: [injected({ target: 'metaMask' })],
  transports: { [polygonAmoy.id]: http() },
})

export const queryClient = new QueryClient()

/** Set after the Remix deploy (docs/handoff.md, Person 1). Unset: minting runs as a labelled sample. */
export const TOKEN_ADDRESS = import.meta.env.VITE_TOKEN_ADDRESS as `0x${string}` | undefined

export const tokenAbi = [
  { type: 'function', name: 'mint', stateMutability: 'nonpayable', inputs: [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [] },
] as const

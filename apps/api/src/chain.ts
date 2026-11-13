import {
  createPublicClient,
  createWalletClient,
  http,
  keccak256,
  parseAbi,
  parseEventLogs,
  parseGwei,
  toHex,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { anvil, bscTestnet } from "viem/chains";
import { config } from "./config.js";

const chain = config.chainId === anvil.id ? anvil : bscTestnet;
const transport = http(config.rpcUrl);

export const abi = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function topUp(address to, uint256 amount, string orNumber)",
  "function settleBatch((bytes32 id, address from, address to, uint256 amount)[] ps)",
  "event PaymentSettled(bytes32 indexed id, address from, address to, uint256 amount)",
  "event PaymentFailed(bytes32 indexed id, string reason)",
]);

// BSC testnet rejects EIP-1559 txs whose priority fee is under 0.1 gwei, and viem/cast
// default the tip to ~1 wei. Legacy txs at a flat gas price avoid that entirely.
const txFees = { type: "legacy", gasPrice: parseGwei(config.gasPriceGwei) } as const;

export const publicClient = createPublicClient({ chain, transport });
const relayer = createWalletClient({ chain, transport, account: privateKeyToAccount(config.relayerKey) });
const deployer = config.deployerKey
  ? createWalletClient({ chain, transport, account: privateKeyToAccount(config.deployerKey) })
  : undefined;

export const explorerTx = (hash: Hex) =>
  chain.blockExplorers?.default ? `${chain.blockExplorers.default.url}/tx/${hash}` : undefined;

/** Off-chain receipt IDs are UUID strings; on-chain they are keccak256 of the UTF-8 bytes. */
export const toChainId = (uuid: string): Hex => keccak256(toHex(uuid));

/** Run wallet writes one at a time per signer so nonces never collide. */
function serial() {
  let tail: Promise<unknown> = Promise.resolve();
  return <T>(fn: () => Promise<T>): Promise<T> => {
    const run = tail.then(fn, fn);
    tail = run.catch(() => undefined);
    return run;
  };
}
const relayerQueue = serial();
const deployerQueue = serial();

export async function balanceOf(address: Address): Promise<bigint> {
  return publicClient.readContract({ address: config.contract, abi, functionName: "balanceOf", args: [address] });
}

export const canTopUp = () => deployer !== undefined;
export const signers = { relayer: relayer.account.address, deployer: deployer?.account.address };

/** Cashier received cash → mint the same amount of tPHP, tagged with the official-receipt number. */
export function topUp(to: Address, amount: bigint, orNumber: string): Promise<Hex> {
  if (!deployer) throw new Error("DEPLOYER_PRIVATE_KEY not configured");
  return deployerQueue(async () => {
    const hash = await deployer.writeContract({
      address: config.contract,
      abi,
      functionName: "topUp",
      args: [to, amount, orNumber],
      ...txFees,
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error(`topUp reverted: ${hash}`);
    return hash;
  });
}

export type Payment = { id: string; from: Address; to: Address; amount: bigint };
export type Outcome =
  | { status: "settled"; txHash: Hex }
  | { status: "failed"; txHash: Hex; reason: string }
  | { status: "duplicate"; txHash: Hex }; // already settled earlier (e.g. by the other phone)

/** Sends one settleBatch tx and maps each receipt UUID to its on-chain outcome. Throws on RPC/revert. */
export function settle(payments: Payment[]): Promise<Map<string, Outcome>> {
  return relayerQueue(async () => {
    const byChainId = new Map(payments.map((p) => [toChainId(p.id), p.id]));
    const hash = await relayer.writeContract({
      address: config.contract,
      abi,
      functionName: "settleBatch",
      args: [payments.map((p) => ({ id: toChainId(p.id), from: p.from, to: p.to, amount: p.amount }))],
      ...txFees,
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error(`settleBatch reverted: ${hash}`);

    const outcomes = new Map<string, Outcome>(payments.map((p) => [p.id, { status: "duplicate", txHash: hash }]));
    for (const log of parseEventLogs({ abi, logs: receipt.logs })) {
      const uuid = byChainId.get(log.args.id as Hex);
      if (!uuid) continue;
      if (log.eventName === "PaymentSettled") outcomes.set(uuid, { status: "settled", txHash: hash });
      if (log.eventName === "PaymentFailed") outcomes.set(uuid, { status: "failed", txHash: hash, reason: log.args.reason });
    }
    return outcomes;
  });
}

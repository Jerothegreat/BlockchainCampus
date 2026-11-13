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
import { log } from "./log.js";
import { config } from "./config.js";

const chain = config.chainId === anvil.id ? anvil : bscTestnet;
const transport = http(config.rpcUrl);

// TagakPesoV2 (~/umak-contracts/src/TagakPesoV2.sol): one wallet per card, closed-loop tPHP.
export const abi = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function walletOf(bytes32 cardId) view returns (address)",
  "function linkCard(bytes32 cardId, address wallet)",
  "function addMerchant(address merchant)",
  "function topUp(bytes32 cardId, uint256 amount, string ref)",
  "function redeem(address from, uint256 amount, string ref)",
  "function settleBatch((bytes32 id, bytes32 cardId, address to, uint256 amount)[] ps)",
  "event PaymentSettled(bytes32 indexed id, bytes32 indexed cardId, address to, uint256 amount)",
  "event PaymentFailed(bytes32 indexed id, string reason)",
]);

// BSC testnet rejects EIP-1559 txs whose priority fee is under 0.1 gwei, and viem/cast
// default the tip to ~1 wei. Legacy txs at a flat gas price avoid that entirely.
const txFees = { type: "legacy", gasPrice: parseGwei(config.gasPriceGwei) } as const;

export const publicClient = createPublicClient({ chain, transport });
const relayer = createWalletClient({ chain, transport, account: privateKeyToAccount(config.relayerKey) });
const deployer = createWalletClient({ chain, transport, account: privateKeyToAccount(config.deployerKey) });

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

/** The wallet a card is bound to on-chain, or the zero address if it was never linked. */
export async function walletOfCard(cardId: Hex): Promise<Address> {
  return publicClient.readContract({ address: config.contract, abi, functionName: "walletOf", args: [cardId] });
}

export const signers = { relayer: relayer.account.address, deployer: deployer.account.address };

/** Owner-only contract writes (Deployer key), one at a time, waiting for confirmation. */
function ownerWrite(functionName: "linkCard" | "addMerchant" | "topUp" | "redeem", args: readonly unknown[]): Promise<Hex> {
  return deployerQueue(async () => {
    // viem can't narrow args from a runtime function name; the ABI above is the source of truth.
    const hash = await deployer.writeContract({ address: config.contract, abi, functionName, args, ...txFees } as never);
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error(`${functionName} reverted: ${hash}`);
    return hash;
  });
}

/** Binds a card (cardId = uidHash) to its wallet on-chain. One-time, immutable. */
export const linkCard = (cardId: Hex, wallet: Address) => ownerWrite("linkCard", [cardId, wallet]);
export const addMerchant = (merchant: Address) => ownerWrite("addMerchant", [merchant]);
/** Money received for this card → mint the same amount of tPHP to its wallet. `ref` = OR number or payment ref. */
export const topUp = (cardId: Hex, amount: bigint, ref: string) => ownerWrite("topUp", [cardId, amount, ref]);
/** Stall withdrawal: burn its tPHP (payout to the stall happens off-chain; simulated in the demo). */
export const redeem = (from: Address, amount: bigint, ref: string) => ownerWrite("redeem", [from, amount, ref]);

export type Payment = { id: string; cardId: Hex; to: Address; amount: bigint };
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
      args: [payments.map((p) => ({ id: toChainId(p.id), cardId: p.cardId, to: p.to, amount: p.amount }))],
      ...txFees,
    });
    log.info("chain", `settleBatch tx sent ${hash}, waiting for confirmation…`);
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error(`settleBatch reverted: ${hash}`);
    log.info("chain", `settleBatch confirmed in block ${receipt.blockNumber}, gas used ${receipt.gasUsed}`);

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

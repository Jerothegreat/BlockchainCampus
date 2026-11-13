import { getAddress, type Hex } from "viem";

try {
  process.loadEnvFile(); // apps/api/.env, if present
} catch {
  // no .env file: rely on the real environment
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var ${name}`);
  return value;
}

// MetaMask exports private keys without the 0x prefix; viem requires it.
const asKey = (value: string): Hex => (value.startsWith("0x") ? value : `0x${value}`) as Hex;

function optionalKey(name: string): Hex | undefined {
  const value = process.env[name];
  return value ? asKey(value) : undefined;
}

export const config = {
  port: Number(process.env.PORT ?? 3000),
  webOrigins: (process.env.WEB_ORIGIN ?? "http://localhost:5173,http://localhost:4173").split(","),
  dbPath: process.env.DB_PATH ?? "umak-pay.db",
  rpcUrl: required("RPC_URL"),
  chainId: Number(process.env.CHAIN_ID ?? 97),
  contract: getAddress(required("CONTRACT")),
  relayerKey: asKey(required("RELAYER_PRIVATE_KEY")),
  // BSC testnet minimum is 0.1 gwei; sent as a legacy tx so the whole price counts as the tip.
  gasPriceGwei: process.env.GAS_PRICE_GWEI ?? "1",
  // Contract owner: links cards, registers stalls, tops up. Required.
  deployerKey: asKey(required("DEPLOYER_PRIVATE_KEY")),
  // Signs the wallet state written to each card. Defaults to the relayer key.
  cardSignerKey: optionalKey("CARD_SIGNER_PRIVATE_KEY") ?? asKey(required("RELAYER_PRIVATE_KEY")),
  cashierKey: process.env.CASHIER_KEY,
  // Receipts must carry an EIP-712 signature from the stall's registered POS device.
  // Set to "false" only while the POS frontend can't sign yet (re-opens receipt forgery).
  requireReceiptSig: process.env.REQUIRE_RECEIPT_SIG !== "false",
  // /sync ships PIN verifiers, so only registered POS devices may fetch it. "false" = open (dev only).
  requireDeviceSync: process.env.REQUIRE_DEVICE_SYNC !== "false",
  defaultOfflineCap: Number(process.env.DEFAULT_OFFLINE_CAP ?? 10000), // centavos (₱100)
};

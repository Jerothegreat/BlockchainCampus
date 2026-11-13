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
  // Optional: only needed for POST /mint (cashier fallback when MetaMask is unavailable).
  deployerKey: optionalKey("DEPLOYER_PRIVATE_KEY"),
  cashierKey: process.env.CASHIER_KEY,
  defaultOfflineCap: Number(process.env.DEFAULT_OFFLINE_CAP ?? 10000), // centavos (₱100)
};

import { timingSafeEqual } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import { getAddress, isAddress, verifyMessage, type Hex } from "viem";
import { config } from "./config.js";
import { db } from "./db.js";

/** preHandler for cashier-only routes (link, cash top-up, device rotation): requires the x-cashier-key header. */
export async function requireCashier(req: FastifyRequest, reply: FastifyReply) {
  if (!config.cashierKey) return reply.code(503).send({ error: "CASHIER_KEY_NOT_CONFIGURED" });
  const given = Buffer.from(String(req.headers["x-cashier-key"] ?? ""));
  const expected = Buffer.from(config.cashierKey);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return reply.code(401).send({ error: "UNAUTHORIZED" });
  }
}

const DEVICE_CLOCK_SKEW_MS = 2 * 60_000;
const deviceByAddress = db.prepare("SELECT id FROM merchants WHERE device_address = ?");

/** Message a POS device signs (EIP-191 personal_sign) to prove it holds a registered key. */
export const deviceAuthMessage = (timestamp: number) => `UMak Pay device auth ${timestamp}`;

/**
 * Checks the device headers and returns the stall the device belongs to, or an error code.
 *   x-device-address:   the POS phone's key address (registered with its stall)
 *   x-device-timestamp: Date.now() in ms, within ±2 minutes of the server clock
 *   x-device-signature: signMessage(deviceAuthMessage(timestamp))
 */
async function authenticateDevice(req: FastifyRequest): Promise<{ merchantId: string } | { error: string }> {
  const address = String(req.headers["x-device-address"] ?? "");
  const timestamp = Number(req.headers["x-device-timestamp"]);
  const signature = String(req.headers["x-device-signature"] ?? "");
  if (!isAddress(address) || !Number.isFinite(timestamp) || !/^0x[0-9a-fA-F]+$/.test(signature)) {
    return { error: "DEVICE_AUTH_REQUIRED" };
  }
  if (Math.abs(Date.now() - timestamp) > DEVICE_CLOCK_SKEW_MS) return { error: "DEVICE_CLOCK_SKEW" };
  const merchant = deviceByAddress.get(getAddress(address)) as { id: string } | undefined;
  if (!merchant) return { error: "DEVICE_NOT_REGISTERED" };
  const valid = await verifyMessage({ address, message: deviceAuthMessage(timestamp), signature: signature as Hex }).catch(
    () => false,
  );
  return valid ? { merchantId: merchant.id } : { error: "DEVICE_AUTH_INVALID" };
}

const authenticatedStall = new WeakMap<FastifyRequest, string>();
/** Stall id of the device that signed this request (after requireStallDevice). */
export const stallOf = (req: FastifyRequest) => authenticatedStall.get(req)!;

/** preHandler for stall-only routes (balance, withdraw). Always enforced. */
export async function requireStallDevice(req: FastifyRequest, reply: FastifyReply) {
  const result = await authenticateDevice(req);
  if ("error" in result) return reply.code(401).send({ error: result.error });
  authenticatedStall.set(req, result.merchantId);
}

/** preHandler for /sync: any registered POS device (REQUIRE_DEVICE_SYNC=false opens it for dev). */
export async function requireDevice(req: FastifyRequest, reply: FastifyReply) {
  if (!config.requireDeviceSync) return;
  return requireStallDevice(req, reply);
}

/** Tiny fixed-window rate limiter (in memory; fine for one server). */
export function rateLimit(max: number, windowMs: number, keyOf: (req: FastifyRequest) => string) {
  const hits = new Map<string, { count: number; resetAt: number }>();
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const key = keyOf(req);
    const now = Date.now();
    const entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      hits.set(key, { count: 1, resetAt: now + windowMs });
      return;
    }
    if (++entry.count > max) {
      reply.header("retry-after", Math.ceil((entry.resetAt - now) / 1000));
      return reply.code(429).send({ error: "RATE_LIMITED" });
    }
  };
}

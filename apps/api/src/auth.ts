import { timingSafeEqual } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import { getAddress, isAddress, verifyMessage, type Hex } from "viem";
import { config } from "./config.js";
import { db } from "./db.js";

/** preHandler for cashier-only routes (link, cash top-up, merchants): requires the x-cashier-key header. */
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
 * preHandler for POS-only routes (/sync). Headers:
 *   x-device-address:   the POS phone's key address (registered via POST /merchants/:id/device)
 *   x-device-timestamp: Date.now() in ms, within ±2 minutes of the server clock
 *   x-device-signature: signMessage(deviceAuthMessage(timestamp))
 */
export async function requireDevice(req: FastifyRequest, reply: FastifyReply) {
  if (!config.requireDeviceSync) return;
  const address = String(req.headers["x-device-address"] ?? "");
  const timestamp = Number(req.headers["x-device-timestamp"]);
  const signature = String(req.headers["x-device-signature"] ?? "");
  if (!isAddress(address) || !Number.isFinite(timestamp) || !/^0x[0-9a-fA-F]+$/.test(signature)) {
    return reply.code(401).send({ error: "DEVICE_AUTH_REQUIRED" });
  }
  if (Math.abs(Date.now() - timestamp) > DEVICE_CLOCK_SKEW_MS) return reply.code(401).send({ error: "DEVICE_CLOCK_SKEW" });
  if (!deviceByAddress.get(getAddress(address))) return reply.code(401).send({ error: "DEVICE_NOT_REGISTERED" });
  const valid = await verifyMessage({ address, message: deviceAuthMessage(timestamp), signature: signature as Hex }).catch(
    () => false,
  );
  if (!valid) return reply.code(401).send({ error: "DEVICE_AUTH_INVALID" });
}

import { timingSafeEqual } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import { config } from "./config.js";

/** preHandler for cashier-only routes (link, mint, merchants): requires the x-cashier-key header. */
export async function requireCashier(req: FastifyRequest, reply: FastifyReply) {
  if (!config.cashierKey) return reply.code(503).send({ error: "CASHIER_KEY_NOT_CONFIGURED" });
  const given = Buffer.from(String(req.headers["x-cashier-key"] ?? ""));
  const expected = Buffer.from(config.cashierKey);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return reply.code(401).send({ error: "UNAUTHORIZED" });
  }
}

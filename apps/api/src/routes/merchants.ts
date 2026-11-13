import type { FastifyPluginAsync } from "fastify";
import type { Address, Hex } from "viem";
import { rateLimit, requireCashier, requireStallDevice, stallOf } from "../auth.js";
import { balanceOf, explorerTx } from "../chain.js";
import { db } from "../db.js";
import {
  createMerchant,
  DuplicateError,
  findMerchant,
  listMerchants,
  merchantView,
  setMerchantDevice,
} from "../services/directory.js";
import { withdraw, WithdrawError, withdrawalsOf } from "../services/withdrawals.js";

const addressSchema = { type: "string", pattern: "^0x[0-9a-fA-F]{40}$" } as const;

const salesOf = db.prepare(
  `SELECT id, amount, status, reason, tx_hash, created_at FROM receipts
   WHERE to_addr = ? ORDER BY created_at DESC LIMIT 50`,
);

/**
 * Stalls. Anyone can register one (no domain gate). A stall can only RECEIVE card payments and
 * WITHDRAW: the contract has no top-up or payment path for stall wallets.
 * Stall-only routes are authenticated by the stall's POS device key (see auth.ts).
 */
const merchantsPlugin: FastifyPluginAsync = async (app) => {
  app.get("/merchants", async () => listMerchants().map(merchantView));

  /** Self-registration from the POS phone: it generates its device key and sends the address. */
  app.post<{ Body: { name: string; deviceAddress: string } }>(
    "/merchants",
    {
      preHandler: rateLimit(5, 60 * 60_000, (req) => `merchant:${req.ip}`), // each is an on-chain tx
      schema: {
        body: {
          type: "object",
          required: ["name", "deviceAddress"],
          properties: { name: { type: "string", minLength: 1, maxLength: 100 }, deviceAddress: addressSchema },
        },
      },
    },
    async (req, reply) => {
      try {
        return reply.code(201).send(merchantView(await createMerchant(req.body.name.trim(), req.body.deviceAddress)));
      } catch (err) {
        if (err instanceof DuplicateError) return reply.code(409).send({ error: err.message });
        req.log.error({ err }, "addMerchant failed");
        return reply.code(502).send({ error: "CHAIN_UNAVAILABLE" });
      }
    },
  );

  /** Lost/replaced POS phone: the cashier moves the stall to a new device key. */
  app.post<{ Params: { id: string }; Body: { deviceAddress: string } }>(
    "/merchants/:id/device",
    {
      preHandler: requireCashier,
      schema: {
        params: { type: "object", properties: { id: { type: "string", format: "uuid" } } },
        body: { type: "object", required: ["deviceAddress"], properties: { deviceAddress: addressSchema } },
      },
    },
    async (req, reply) => {
      try {
        if (!setMerchantDevice(req.params.id, req.body.deviceAddress)) return reply.code(404).send({ error: "NOT_FOUND" });
      } catch (err) {
        if (err instanceof DuplicateError) return reply.code(409).send({ error: err.message });
        throw err;
      }
      return { ok: true };
    },
  );

  /** The stall's own view: on-chain balance, recent sales and withdrawals. */
  app.get("/merchants/me", { preHandler: requireStallDevice }, async (req, reply) => {
    const stall = findMerchant(stallOf(req))!;
    let balance: number | null = null;
    try {
      balance = Number(await balanceOf(stall.address as Address));
    } catch (err) {
      req.log.warn({ err }, "balance read failed");
    }
    const sales = (salesOf.all(stall.address) as { id: string; amount: number; status: string; reason: string | null; tx_hash: string | null; created_at: number }[]).map(
      (r) => ({
        id: r.id,
        amount: r.amount,
        status: r.status,
        reason: r.reason,
        txHash: r.tx_hash,
        explorer: r.tx_hash ? explorerTx(r.tx_hash as Hex) : undefined,
        createdAt: r.created_at,
      }),
    );
    return { ...merchantView(stall), balance, sales, withdrawals: withdrawalsOf(stall.id) };
  });

  /** Cash-out: burns the stall's tPHP; payout simulated. `id` = client UUID (idempotency key). */
  app.post<{ Body: { id: string; amount: number } }>(
    "/merchants/withdraw",
    {
      preHandler: requireStallDevice,
      schema: {
        body: {
          type: "object",
          required: ["id", "amount"],
          properties: { id: { type: "string", format: "uuid" }, amount: { type: "integer", minimum: 1, maximum: 10_000_000 } },
        },
      },
    },
    async (req, reply) => {
      try {
        return await withdraw(findMerchant(stallOf(req))!, req.body.id, req.body.amount);
      } catch (err) {
        if (err instanceof WithdrawError) return reply.code(err.status).send({ error: err.message });
        throw err;
      }
    },
  );
};

export default merchantsPlugin;

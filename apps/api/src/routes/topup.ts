import type { FastifyPluginAsync } from "fastify";
import type { Address } from "viem";
import { requireCashier } from "../auth.js";
import { canTopUp, explorerTx, topUp } from "../chain.js";
import { db } from "../db.js";

const addressByUid = db.prepare("SELECT address FROM students WHERE uid_hash = ?");

/** Cashier top-up (TagakPeso.topUp) signed by the Deployer key — fallback for when MetaMask won't connect. */
const topUpPlugin: FastifyPluginAsync = async (app) => {
  app.post<{ Body: { uidHash: string; amount: number; orNumber: string } }>(
    "/topup",
    {
      preHandler: requireCashier,
      schema: {
        body: {
          type: "object",
          required: ["uidHash", "amount", "orNumber"],
          properties: {
            uidHash: { type: "string", pattern: "^[0-9a-f]{64}$" },
            amount: { type: "integer", minimum: 1, maximum: 10_000_000 }, // centavos, max ₱100k
            orNumber: { type: "string", minLength: 1, maxLength: 32 }, // official receipt for the cash taken
          },
        },
      },
    },
    async (req, reply) => {
      if (!canTopUp()) return reply.code(503).send({ error: "TOPUP_NOT_CONFIGURED" });
      const row = addressByUid.get(req.body.uidHash) as { address: string } | undefined;
      if (!row) return reply.code(404).send({ error: "STUDENT_NOT_FOUND" });
      try {
        const txHash = await topUp(row.address as Address, BigInt(req.body.amount), req.body.orNumber);
        return { txHash, explorer: explorerTx(txHash) };
      } catch (err) {
        req.log.error({ err }, "topUp failed");
        return reply.code(502).send({ error: "CHAIN_UNAVAILABLE" });
      }
    },
  );
};

export default topUpPlugin;

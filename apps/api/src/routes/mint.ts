import type { FastifyPluginAsync } from "fastify";
import type { Address } from "viem";
import { requireCashier } from "../auth.js";
import { canMint, explorerTx, mint } from "../chain.js";
import { db } from "../db.js";

const addressByUid = db.prepare("SELECT address FROM students WHERE uid_hash = ?");

/** Cashier top-up signed by the Deployer key — fallback for when MetaMask won't connect. */
const mintPlugin: FastifyPluginAsync = async (app) => {
  app.post<{ Body: { uidHash: string; amount: number } }>(
    "/mint",
    {
      preHandler: requireCashier,
      schema: {
        body: {
          type: "object",
          required: ["uidHash", "amount"],
          properties: {
            uidHash: { type: "string", pattern: "^[0-9a-f]{64}$" },
            amount: { type: "integer", minimum: 1, maximum: 10_000_000 }, // centavos, max ₱100k
          },
        },
      },
    },
    async (req, reply) => {
      if (!canMint()) return reply.code(503).send({ error: "MINT_NOT_CONFIGURED" });
      const row = addressByUid.get(req.body.uidHash) as { address: string } | undefined;
      if (!row) return reply.code(404).send({ error: "STUDENT_NOT_FOUND" });
      try {
        const txHash = await mint(row.address as Address, BigInt(req.body.amount));
        return { txHash, explorer: explorerTx(txHash) };
      } catch (err) {
        req.log.error({ err }, "mint failed");
        return reply.code(502).send({ error: "CHAIN_UNAVAILABLE" });
      }
    },
  );
};

export default mintPlugin;

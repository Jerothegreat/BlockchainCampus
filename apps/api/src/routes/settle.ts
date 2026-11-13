import type { FastifyPluginAsync } from "fastify";
import { config } from "../config.js";
import { getReceipt, submitReceipts, toResult, type ReceiptIn } from "../services/receipts.js";

const MAX_BATCH = 50;

const bodySchema = {
  type: "object",
  required: ["receipts"],
  properties: {
    receipts: {
      type: "array",
      minItems: 1,
      maxItems: MAX_BATCH,
      items: {
        type: "object",
        required: ["id", "cardId", "to", "amount", "createdAt", "cardNonce", ...(config.requireReceiptSig ? ["sig"] : [])],
        properties: {
          id: { type: "string", format: "uuid" },
          cardId: { type: "string", pattern: "^0x[0-9a-fA-F]{64}$" },
          to: { type: "string", pattern: "^0x[0-9a-fA-F]{40}$" },
          amount: { type: "integer", minimum: 1, maximum: 10_000_000 },
          createdAt: { type: "integer", minimum: 0 },
          cardNonce: { type: "integer", minimum: 0, maximum: 4294967295 },
          sig: { type: "string", pattern: "^0x[0-9a-fA-F]{130}$" },
        },
      },
    },
  },
} as const;

/** POST /settle: POS queue push. Idempotent; the same receipt may also arrive via /cards/refresh. */
const settlePlugin: FastifyPluginAsync = async (app) => {
  app.post<{ Body: { receipts: ReceiptIn[] } }>("/settle", { schema: { body: bodySchema } }, async (req, reply) => {
    const { results, chainError } = await submitReceipts(req.body.receipts);
    if (chainError) return reply.code(502).send({ error: "CHAIN_UNAVAILABLE", results });
    return { results };
  });

  app.get<{ Params: { id: string } }>(
    "/receipts/:id",
    { schema: { params: { type: "object", properties: { id: { type: "string", format: "uuid" } } } } },
    async (req, reply) => {
      const row = getReceipt(req.params.id);
      if (!row) return reply.code(404).send({ error: "NOT_FOUND" });
      return toResult(row);
    },
  );
};

export default settlePlugin;

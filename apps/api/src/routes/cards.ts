import { randomUUID } from "node:crypto";
import type { FastifyPluginAsync, FastifyReply } from "fastify";
import { requireCashier } from "../auth.js";
import { CardError, refreshCard, topUpCard } from "../services/cards.js";

const cardBody = {
  uid: { type: "string", minLength: 4, maxLength: 64 },
  card: { type: "string", pattern: "^0x[0-9a-fA-F]{2,1024}$" }, // record bytes read from the card
} as const;

const fail = (reply: FastifyReply, err: unknown) => {
  if (err instanceof CardError) return reply.code(err.status).send({ error: err.message });
  throw err;
};

/**
 * Card wallet endpoints. Each needs the card physically tapped (UID + record) and returns a
 * new `card` record the phone MUST write back to the card before telling the user it's done.
 */
const cardsPlugin: FastifyPluginAsync = async (app) => {
  /** Settle what's on/for the card and get a fresh clear state (student phone or online POS). */
  app.post<{ Body: { uid: string; card: string } }>(
    "/cards/refresh",
    { schema: { body: { type: "object", required: ["uid", "card"], properties: cardBody } } },
    async (req, reply) => {
      try {
        return await refreshCard(req.body.uid, req.body.card);
      } catch (err) {
        return fail(reply, err);
      }
    },
  );

  /** Student adds balance online (mock payment provider for the demo). */
  app.post<{ Body: { uid: string; card: string; amount: number } }>(
    "/cards/topup",
    {
      schema: {
        body: {
          type: "object",
          required: ["uid", "card", "amount"],
          properties: { ...cardBody, amount: { type: "integer", minimum: 100, maximum: 500_000 } }, // ₱1–₱5,000
        },
      },
    },
    async (req, reply) => {
      try {
        // Demo: payment is assumed successful. Real version: confirm with GCash/Maya webhook first.
        const ref = `ONLINE-MOCK-${randomUUID().slice(0, 8)}`;
        return await topUpCard(req.body.uid, req.body.card, req.body.amount, { method: "online", ref });
      } catch (err) {
        return fail(reply, err);
      }
    },
  );

  /** Cash top-up at the cashier desk (same card rules). */
  app.post<{ Body: { uid: string; card: string; amount: number; orNumber: string } }>(
    "/cards/topup/cash",
    {
      preHandler: requireCashier,
      schema: {
        body: {
          type: "object",
          required: ["uid", "card", "amount", "orNumber"],
          properties: {
            ...cardBody,
            amount: { type: "integer", minimum: 1, maximum: 10_000_000 },
            orNumber: { type: "string", minLength: 1, maxLength: 32 },
          },
        },
      },
    },
    async (req, reply) => {
      try {
        return await topUpCard(req.body.uid, req.body.card, req.body.amount, { method: "cash", orNumber: req.body.orNumber });
      } catch (err) {
        return fail(reply, err);
      }
    },
  );
};

export default cardsPlugin;

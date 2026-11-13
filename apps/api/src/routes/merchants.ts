import type { FastifyPluginAsync } from "fastify";
import { requireCashier } from "../auth.js";
import { createMerchant, DuplicateError, listMerchants, merchantView, setMerchantDevice } from "../services/directory.js";

const addressSchema = { type: "string", pattern: "^0x[0-9a-fA-F]{40}$" } as const;

/** Stalls, plus the POS phone key ("device") that signs each stall's receipts. */
const merchantsPlugin: FastifyPluginAsync = async (app) => {
  app.get("/merchants", async () => listMerchants().map(merchantView));

  app.post<{ Body: { name: string; deviceAddress?: string } }>(
    "/merchants",
    {
      preHandler: requireCashier,
      schema: {
        body: {
          type: "object",
          required: ["name"],
          properties: { name: { type: "string", minLength: 1, maxLength: 100 }, deviceAddress: addressSchema },
        },
      },
    },
    async (req, reply) => {
      try {
        return reply.code(201).send(merchantView(await createMerchant(req.body.name, req.body.deviceAddress)));
      } catch (err) {
        if (err instanceof DuplicateError) return reply.code(409).send({ error: err.message });
        req.log.error({ err }, "addMerchant failed");
        return reply.code(502).send({ error: "CHAIN_UNAVAILABLE" });
      }
    },
  );

  /** POS phone generates a key locally and shows its address; the cashier registers it here. */
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
};

export default merchantsPlugin;

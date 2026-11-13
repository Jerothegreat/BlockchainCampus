import type { FastifyPluginAsync } from "fastify";
import { getAddress, type Address, type Hex } from "viem";
import type { Payment } from "../chain.js";
import { config } from "../config.js";
import { db } from "../db.js";
import { verifyReceipt } from "../receipt.js";
import { getReceipt, settleAndRecord, toResult, upsertReceipt, type ReceiptResult } from "../services/receipts.js";

type ReceiptIn = { id: string; from: string; to: string; amount: number; createdAt?: number; sig?: string };

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
        required: config.requireReceiptSig ? ["id", "from", "to", "amount", "createdAt", "sig"] : ["id", "from", "to", "amount"],
        properties: {
          id: { type: "string", format: "uuid" },
          from: { type: "string", pattern: "^0x[0-9a-fA-F]{40}$" },
          to: { type: "string", pattern: "^0x[0-9a-fA-F]{40}$" },
          amount: { type: "integer", minimum: 1, maximum: 10_000_000 },
          createdAt: { type: "integer", minimum: 0 },
          sig: { type: "string", pattern: "^0x[0-9a-fA-F]{130}$" },
        },
      },
    },
  },
} as const;

const isStudent = db.prepare("SELECT 1 FROM students WHERE address = ?");
const merchantByAddress = db.prepare("SELECT device_address FROM merchants WHERE address = ?");

const reject = (id: string, reason: string): ReceiptResult => ({ id, status: "rejected", reason });

/**
 * POST /settle: the POS and the student phone both push the same receipts; settling is idempotent.
 * Each receipt must be signed by the receiving stall's registered POS device (see receipt.ts).
 */
const settlePlugin: FastifyPluginAsync = async (app) => {
  app.post<{ Body: { receipts: ReceiptIn[] } }>("/settle", { schema: { body: bodySchema } }, async (req, reply) => {
    const results = new Map<string, ReceiptResult>();
    const toSend: Payment[] = [];

    for (const r of req.body.receipts) {
      if (results.has(r.id)) continue; // same receipt twice in one batch
      const from = getAddress(r.from);
      const to = getAddress(r.to);
      const createdAt = r.createdAt ?? Date.now();

      // Only known students can pay, and only to known stalls.
      const merchant = merchantByAddress.get(to) as { device_address: string | null } | undefined;
      if (!isStudent.get(from) || !merchant) {
        results.set(r.id, reject(r.id, "UNKNOWN_PARTY"));
        continue;
      }

      // Already recorded (e.g. pushed earlier by the other phone): never re-verify or resend, just report.
      const existing = getReceipt(r.id);
      if (!existing) {
        if (config.requireReceiptSig) {
          if (!merchant.device_address) {
            results.set(r.id, reject(r.id, "STALL_HAS_NO_DEVICE"));
            continue;
          }
          const signed = { id: r.id, from, to, amount: r.amount, createdAt, sig: r.sig as Hex };
          if (!(await verifyReceipt(signed, merchant.device_address as Address))) {
            results.set(r.id, reject(r.id, "BAD_SIGNATURE"));
            continue;
          }
        }
      }

      const row = existing ?? upsertReceipt({ id: r.id, from, to, amount: r.amount, createdAt, sig: r.sig as Hex | undefined });
      // A receipt ID is immutable: a resubmission with different details is not the same payment.
      if (row.from_addr !== from || row.to_addr !== to || row.amount !== r.amount) {
        results.set(r.id, reject(r.id, "CONFLICT"));
        continue;
      }
      results.set(r.id, toResult(row));
      if (row.status === "pending") toSend.push({ id: r.id, from, to, amount: BigInt(r.amount) });
    }

    if (toSend.length > 0) {
      try {
        for (const result of await settleAndRecord(toSend)) results.set(result.id, result);
      } catch (err) {
        req.log.error({ err }, "settleBatch failed; receipts left pending");
        return reply.code(502).send({ error: "CHAIN_UNAVAILABLE", results: [...results.values()] });
      }
    }

    return { results: [...results.values()] };
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

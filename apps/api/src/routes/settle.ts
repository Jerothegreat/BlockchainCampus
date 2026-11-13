import type { FastifyPluginAsync } from "fastify";
import { getAddress, type Address } from "viem";
import { explorerTx, settle, type Payment } from "../chain.js";
import { db } from "../db.js";

type ReceiptIn = { id: string; from: string; to: string; amount: number; createdAt?: number };
type ReceiptRow = {
  id: string;
  from_addr: string;
  to_addr: string;
  amount: number;
  status: "pending" | "settled" | "failed";
  reason: string | null;
  tx_hash: string | null;
};
type Result = { id: string; status: string; reason?: string | null; txHash?: string | null; explorer?: string };

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
        required: ["id", "from", "to", "amount"],
        properties: {
          id: { type: "string", format: "uuid" },
          from: { type: "string", pattern: "^0x[0-9a-fA-F]{40}$" },
          to: { type: "string", pattern: "^0x[0-9a-fA-F]{40}$" },
          amount: { type: "integer", minimum: 1, maximum: 10_000_000 },
          createdAt: { type: "integer" },
        },
      },
    },
  },
} as const;

const getReceipt = db.prepare("SELECT * FROM receipts WHERE id = ?");
const insertReceipt = db.prepare(
  `INSERT INTO receipts (id, from_addr, to_addr, amount, created_at, updated_at)
   VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING`,
);
const updateReceipt = db.prepare("UPDATE receipts SET status = ?, reason = ?, tx_hash = ?, updated_at = ? WHERE id = ?");
const isStudent = db.prepare("SELECT 1 FROM students WHERE address = ?");
const isMerchant = db.prepare("SELECT 1 FROM merchants WHERE address = ?");

const toResult = (row: ReceiptRow): Result => ({
  id: row.id,
  status: row.status,
  reason: row.reason,
  txHash: row.tx_hash,
  explorer: row.tx_hash ? explorerTx(row.tx_hash as `0x${string}`) : undefined,
});

/** POST /settle — both the POS and the student phone push the same receipts; settling is idempotent. */
const settlePlugin: FastifyPluginAsync = async (app) => {
  app.post<{ Body: { receipts: ReceiptIn[] } }>("/settle", { schema: { body: bodySchema } }, async (req, reply) => {
    const results = new Map<string, Result>();
    const toSend: Payment[] = [];

    for (const r of req.body.receipts) {
      if (results.has(r.id)) continue; // same receipt twice in one batch
      const from = getAddress(r.from);
      const to = getAddress(r.to);

      // Only known students can pay, and only to known merchants.
      if (!isStudent.get(from) || !isMerchant.get(to)) {
        results.set(r.id, { id: r.id, status: "rejected", reason: "UNKNOWN_PARTY" });
        continue;
      }

      const now = Date.now();
      insertReceipt.run(r.id, from, to, r.amount, r.createdAt ?? now, now);
      const row = getReceipt.get(r.id) as ReceiptRow;

      // A receipt ID is immutable: a resubmission with different details is not the same payment.
      if (row.from_addr !== from || row.to_addr !== to || row.amount !== r.amount) {
        results.set(r.id, { id: r.id, status: "rejected", reason: "CONFLICT" });
        continue;
      }
      results.set(r.id, toResult(row));
      if (row.status === "pending") toSend.push({ id: r.id, from: from as Address, to: to as Address, amount: BigInt(r.amount) });
    }

    if (toSend.length > 0) {
      try {
        const outcomes = await settle(toSend);
        const now = Date.now();
        for (const [id, o] of outcomes) {
          const status = o.status === "failed" ? "failed" : "settled"; // duplicate = settled earlier on-chain
          const reason = o.status === "failed" ? o.reason : null;
          updateReceipt.run(status, reason, o.txHash, now, id);
          results.set(id, toResult(getReceipt.get(id) as ReceiptRow));
        }
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
      const row = getReceipt.get(req.params.id) as ReceiptRow | undefined;
      if (!row) return reply.code(404).send({ error: "NOT_FOUND" });
      return toResult(row);
    },
  );
};

export default settlePlugin;

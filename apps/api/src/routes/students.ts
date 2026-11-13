import type { FastifyPluginAsync } from "fastify";
import { getAddress, type Address } from "viem";
import { requireCashier, requireDevice } from "../auth.js";
import { cardSignerAddress } from "../cardstate.js";
import { balanceOf, explorerTx } from "../chain.js";
import { db } from "../db.js";
import {
  createStudent,
  DuplicateError,
  findStudentByAddress,
  findStudentByUid,
  listMerchants,
  listStudents,
  merchantView,
  normalizeUid,
} from "../services/directory.js";

const uidHashParams = {
  type: "object",
  properties: { uidHash: { type: "string", pattern: "^[0-9a-f]{64}$" } },
} as const;
const addressParams = {
  type: "object",
  properties: { address: { type: "string", pattern: "^0x[0-9a-fA-F]{40}$" } },
} as const;

const receiptsOf = db.prepare(
  `SELECT r.id, r.to_addr, m.name AS merchant, r.amount, r.status, r.reason, r.tx_hash, r.created_at
   FROM receipts r LEFT JOIN merchants m ON m.address = r.to_addr
   WHERE r.from_addr = ? ORDER BY r.created_at DESC LIMIT ?`,
);
const pendingTotalOf = db.prepare("SELECT COALESCE(SUM(amount), 0) AS total FROM receipts WHERE from_addr = ? AND status = 'pending'");

type HistoryRow = {
  id: string;
  to_addr: string;
  merchant: string | null;
  amount: number;
  status: string;
  reason: string | null;
  tx_hash: string | null;
  created_at: number;
};

const studentsPlugin: FastifyPluginAsync = async (app) => {
  /** Cashier links a tapped ID card to a student and sets their PIN. */
  app.post<{ Body: { uid: string; studentNo: string; name?: string; pin: string } }>(
    "/link",
    {
      preHandler: requireCashier,
      schema: {
        body: {
          type: "object",
          required: ["uid", "studentNo", "pin"],
          properties: {
            uid: { type: "string", minLength: 4, maxLength: 64 },
            studentNo: { type: "string", minLength: 1, maxLength: 32 },
            name: { type: "string", maxLength: 100 },
            pin: { type: "string", pattern: "^[0-9]{4,6}$" },
          },
        },
      },
    },
    async (req, reply) => {
      if (normalizeUid(req.body.uid).length < 4) return reply.code(400).send({ error: "INVALID_UID" });
      try {
        // Response includes `card`: the initial wallet record the cashier phone writes to the card.
        return reply.code(201).send(await createStudent(req.body));
      } catch (err) {
        if (err instanceof DuplicateError) return reply.code(409).send({ error: err.message });
        req.log.error({ err }, "link failed");
        return reply.code(502).send({ error: "CHAIN_UNAVAILABLE" });
      }
    },
  );

  app.get<{ Params: { uidHash: string } }>(
    "/students/by-uid/:uidHash",
    { schema: { params: uidHashParams } },
    async (req, reply) => {
      const row = findStudentByUid(req.params.uidHash);
      if (!row) return reply.code(404).send({ error: "NOT_FOUND" });
      const balance = Number(await balanceOf(row.address as Address));
      return {
        uidHash: row.uid_hash,
        studentNo: row.student_no,
        name: row.name,
        address: row.address,
        balance,
        offlineCap: Math.min(row.offline_cap, balance),
      };
    },
  );

  /** Student phone (/me): balance, unsettled total and payment history, newest first. */
  app.get<{ Params: { address: string }; Querystring: { limit?: number } }>(
    "/students/:address/receipts",
    {
      schema: {
        params: addressParams,
        querystring: { type: "object", properties: { limit: { type: "integer", minimum: 1, maximum: 200, default: 50 } } },
      },
    },
    async (req, reply) => {
      const address = getAddress(req.params.address);
      const student = findStudentByAddress(address);
      if (!student) return reply.code(404).send({ error: "NOT_FOUND" });
      let balance: number | null = null;
      try {
        balance = Number(await balanceOf(address));
      } catch (err) {
        req.log.warn({ err }, "balance read failed; returning history without balance");
      }
      const rows = receiptsOf.all(address, req.query.limit ?? 50) as HistoryRow[];
      return {
        address,
        studentNo: student.student_no,
        name: student.name,
        balance, // null when the chain is unreachable
        pendingTotal: (pendingTotalOf.get(address) as { total: number }).total,
        receipts: rows.map((r) => ({
          id: r.id,
          to: r.to_addr,
          merchant: r.merchant,
          amount: r.amount,
          status: r.status,
          reason: r.reason,
          txHash: r.tx_hash,
          explorer: r.tx_hash ? explorerTx(r.tx_hash as `0x${string}`) : undefined,
          createdAt: r.created_at,
        })),
      };
    },
  );

  /** Snapshot a registered POS device caches for offline checks (balance - pending, offlineCap, PIN). */
  app.get("/sync", { preHandler: requireDevice }, async (req, reply) => {
    const rows = listStudents();
    let balances: bigint[];
    try {
      balances = await Promise.all(rows.map((r) => balanceOf(r.address as Address)));
    } catch (err) {
      req.log.error({ err }, "balance read failed during /sync");
      return reply.code(502).send({ error: "CHAIN_UNAVAILABLE" });
    }
    return {
      syncedAt: Date.now(),
      cardSigner: cardSignerAddress, // verify card records offline against this address
      students: rows.map((r, i) => ({
        uidHash: r.uid_hash,
        studentNo: r.student_no,
        name: r.name,
        address: r.address,
        pinHash: r.pin_hash,
        pinSalt: r.pin_salt, // PBKDF2 params, see pin.ts; null = legacy sha256(pin + uid)
        pinIter: r.pin_iter,
        balance: Number(balances[i]),
        offlineCap: Math.min(r.offline_cap, Number(balances[i])),
        cardNonce: r.card_nonce, // latest issued state; a card showing less is a stale copy
        blocked: r.blocked === 1, // cloned / rolled-back card: refuse
      })),
      merchants: listMerchants().map(merchantView),
    };
  });
};

export default studentsPlugin;

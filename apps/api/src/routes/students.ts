import { createHash, randomUUID } from "node:crypto";
import type { FastifyPluginAsync } from "fastify";
import { generatePrivateKey, privateKeyToAddress } from "viem/accounts";
import type { Address } from "viem";
import { requireCashier } from "../auth.js";
import { balanceOf } from "../chain.js";
import { config } from "../config.js";
import { db } from "../db.js";

type StudentRow = {
  uid_hash: string;
  student_no: string;
  name: string;
  address: string;
  pin_hash: string;
  offline_cap: number;
};

// Must match apps/web/src/lib/uid.ts so the POS can hash offline and get the same values.
const normalizeUid = (uid: string) => uid.replace(/[^0-9a-f]/gi, "").toLowerCase();
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

/**
 * Students never hold keys: the relayer moves funds via settleBatch, so each student
 * (and merchant) just needs a unique address. The generated private key is discarded.
 */
const newAddress = () => privateKeyToAddress(generatePrivateKey());

const insertStudent = db.prepare(
  `INSERT INTO students (uid_hash, student_no, name, address, pin_hash, offline_cap, created_at)
   VALUES (?, ?, ?, ?, ?, ?, ?)`,
);
const studentByUid = db.prepare("SELECT * FROM students WHERE uid_hash = ?");
const allStudents = db.prepare("SELECT * FROM students ORDER BY student_no");
const insertMerchant = db.prepare("INSERT INTO merchants (id, name, address) VALUES (?, ?, ?)");
const allMerchants = db.prepare("SELECT id, name, address FROM merchants ORDER BY name");

const uidHashParams = {
  type: "object",
  properties: { uidHash: { type: "string", pattern: "^[0-9a-f]{64}$" } },
} as const;

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
      const uid = normalizeUid(req.body.uid);
      if (uid.length < 4) return reply.code(400).send({ error: "INVALID_UID" });
      const uidHash = sha256(uid);
      const address = newAddress();
      try {
        insertStudent.run(
          uidHash,
          req.body.studentNo,
          req.body.name ?? req.body.studentNo,
          address,
          sha256(req.body.pin + uid),
          config.defaultOfflineCap,
          Date.now(),
        );
      } catch (err) {
        if ((err as { code?: string }).code === "ERR_SQLITE_ERROR" && String((err as Error).message).includes("UNIQUE")) {
          return reply.code(409).send({ error: "ALREADY_LINKED" });
        }
        throw err;
      }
      return reply.code(201).send({ uidHash, studentNo: req.body.studentNo, address });
    },
  );

  app.get<{ Params: { uidHash: string } }>(
    "/students/by-uid/:uidHash",
    { schema: { params: uidHashParams } },
    async (req, reply) => {
      const row = studentByUid.get(req.params.uidHash) as StudentRow | undefined;
      if (!row) return reply.code(404).send({ error: "NOT_FOUND" });
      const balance = await balanceOf(row.address as Address);
      return {
        uidHash: row.uid_hash,
        studentNo: row.student_no,
        name: row.name,
        address: row.address,
        balance: Number(balance),
        offlineCap: row.offline_cap,
      };
    },
  );

  /** Snapshot the POS caches in IndexedDB for offline checks (balance - pending, offlineCap, PIN). */
  app.get("/sync", async (req, reply) => {
    const rows = allStudents.all() as StudentRow[];
    let balances: bigint[];
    try {
      balances = await Promise.all(rows.map((r) => balanceOf(r.address as Address)));
    } catch (err) {
      req.log.error({ err }, "balance read failed during /sync");
      return reply.code(502).send({ error: "CHAIN_UNAVAILABLE" });
    }
    return {
      syncedAt: Date.now(),
      students: rows.map((r, i) => ({
        uidHash: r.uid_hash,
        studentNo: r.student_no,
        name: r.name,
        address: r.address,
        pinHash: r.pin_hash,
        balance: Number(balances[i]),
        offlineCap: Math.min(r.offline_cap, Number(balances[i])),
      })),
      merchants: allMerchants.all(),
    };
  });

  app.post<{ Body: { name: string } }>(
    "/merchants",
    {
      preHandler: requireCashier,
      schema: {
        body: { type: "object", required: ["name"], properties: { name: { type: "string", minLength: 1, maxLength: 100 } } },
      },
    },
    async (req, reply) => {
      const merchant = { id: randomUUID(), name: req.body.name, address: newAddress() };
      insertMerchant.run(merchant.id, merchant.name, merchant.address);
      return reply.code(201).send(merchant);
    },
  );

  app.get("/merchants", async () => allMerchants.all());
};

export default studentsPlugin;

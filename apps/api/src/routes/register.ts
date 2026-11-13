import { createHash, timingSafeEqual } from "node:crypto";
import type { FastifyPluginAsync } from "fastify";
import { rateLimit } from "../auth.js";
import { config } from "../config.js";
import { createStudent, DuplicateError, normalizeUid, uidHashOf, findStudentByUid } from "../services/directory.js";
import { hashPin, newPinVerifier } from "../pin.js";
import { CardError, restoreCard } from "../services/cards.js";

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const studentEmail = new RegExp(`^[a-z0-9._%+-]+@${escapeRegex(config.studentEmailDomain)}$`);

/**
 * POST /cards/register: a UMak student registers their own card from the student app.
 * Gate: an @umak.edu.ph email (format/domain check only, no verification), one card per email.
 * Creates the card's wallet, links it on-chain, and returns the first card record to WRITE to the card.
 */
const registerPlugin: FastifyPluginAsync = async (app) => {
  // A missing wallet record does not mean the ID is unregistered (e.g. on a new demo device).
  app.post<{ Body: { uid: string } }>("/cards/lookup", {
    schema: { body: { type: "object", required: ["uid"], properties: {
      uid: { type: "string", minLength: 4, maxLength: 64 },
    } } },
  }, async (req, reply) => {
    if (normalizeUid(req.body.uid).length < 4) return reply.code(400).send({ error: "INVALID_UID" });
    return { registered: !!findStudentByUid(uidHashOf(req.body.uid)) };
  });

  const dummy = newPinVerifier("000000");
  app.post<{ Body: { uid: string; email: string; studentNo: string; pin: string; restoreCard?: boolean } }>("/cards/login", {
    preHandler: rateLimit(10, 10 * 60_000, (req) => `student-login:${req.ip}`),
    schema: { body: { type: "object", required: ["uid", "email", "studentNo", "pin"], properties: {
      uid: { type: "string", minLength: 4, maxLength: 64 },
      email: { type: "string", minLength: 1, maxLength: 120 },
      studentNo: { type: "string", minLength: 1, maxLength: 32 },
      pin: { type: "string", pattern: "^[0-9]{6}$" },
      restoreCard: { type: "boolean" },
    } } },
  }, async (req, reply) => {
    const uid = normalizeUid(req.body.uid);
    if (uid.length < 4) return reply.code(400).send({ error: "INVALID_UID" });
    const student = findStudentByUid(uidHashOf(uid));
    const actualHash = student && !student.pin_salt
      ? createHash("sha256").update(req.body.pin + uid).digest("hex")
      : hashPin(req.body.pin, student?.pin_salt ?? dummy.salt, student?.pin_iter ?? dummy.iterations);
    const expected = Buffer.from(student?.pin_hash ?? dummy.hash, "hex");
    const actual = Buffer.from(actualHash, "hex");
    const pinOk = actual.length === expected.length && timingSafeEqual(actual, expected);
    if (!student || student.email !== req.body.email.trim().toLowerCase() ||
        student.student_no !== req.body.studentNo.trim() || !pinOk) {
      return reply.code(401).send({ error: "INVALID_CREDENTIALS" });
    }
    if (student.blocked) return reply.code(403).send({ error: "CARD_BLOCKED" });
    const profile = { uidHash: student.uid_hash, address: student.address, name: student.name, studentNo: student.student_no };
    if (!req.body.restoreCard) return profile;
    try {
      return { ...profile, ...(await restoreCard(uid)) };
    } catch (err) {
      if (err instanceof CardError) return reply.code(err.status).send({ error: err.message });
      req.log.error({ err }, "card restoration failed");
      return reply.code(502).send({ error: "CHAIN_UNAVAILABLE" });
    }
  });

  app.post<{ Body: { email: string; uid: string; studentNo: string; name?: string; pin: string } }>(
    "/cards/register",
    {
      // Each registration is an on-chain tx paid by the Deployer: cap it per IP.
      preHandler: rateLimit(10, 10 * 60_000, (req) => `register:${req.ip}`),
      schema: {
        body: {
          type: "object",
          required: ["email", "uid", "studentNo", "pin"],
          properties: {
            email: { type: "string", maxLength: 120 },
            uid: { type: "string", minLength: 4, maxLength: 64 },
            studentNo: { type: "string", minLength: 1, maxLength: 32 },
            name: { type: "string", maxLength: 100 },
            pin: { type: "string", pattern: "^[0-9]{6}$" },
          },
        },
      },
    },
    async (req, reply) => {
      const email = req.body.email.trim().toLowerCase();
      if (!studentEmail.test(email)) return reply.code(403).send({ error: "UMAK_EMAIL_REQUIRED" });
      if (normalizeUid(req.body.uid).length < 4) return reply.code(400).send({ error: "INVALID_UID" });
      try {
        return reply.code(201).send(await createStudent({ ...req.body, email }));
      } catch (err) {
        if (err instanceof DuplicateError) return reply.code(409).send({ error: err.message });
        req.log.error({ err }, "self-registration failed");
        return reply.code(502).send({ error: "CHAIN_UNAVAILABLE" });
      }
    },
  );
};

export default registerPlugin;

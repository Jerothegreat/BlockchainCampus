import type { FastifyPluginAsync } from "fastify";
import { rateLimit } from "../auth.js";
import { config } from "../config.js";
import { createStudent, DuplicateError, normalizeUid } from "../services/directory.js";

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const studentEmail = new RegExp(`^[a-z0-9._%+-]+@${escapeRegex(config.studentEmailDomain)}$`);

/**
 * POST /cards/register: a UMak student registers their own card from the student app.
 * Gate: an @umak.edu.ph email (format/domain check only, no verification), one card per email.
 * Creates the card's wallet, links it on-chain, and returns the first card record to WRITE to the card.
 */
const registerPlugin: FastifyPluginAsync = async (app) => {
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
            pin: { type: "string", pattern: "^[0-9]{4,6}$" },
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

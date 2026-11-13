import assert from "node:assert/strict";
import { after, test } from "node:test";
import Fastify from "fastify";

// Isolated database and synthetic chain configuration; these tests never contact the chain.
process.env.DB_PATH = ":memory:";
process.env.RPC_URL = "http://127.0.0.1:1";
process.env.CONTRACT = `0x${"1".repeat(40)}`;
process.env.RELAYER_PRIVATE_KEY = `0x${"1".repeat(64)}`;
process.env.DEPLOYER_PRIVATE_KEY = `0x${"2".repeat(64)}`;
const { db } = await import("../db.js");
const { uidHashOf } = await import("../services/directory.js");
const { newPinVerifier } = await import("../pin.js");
const { default: register } = await import("./register.js");
const { publicClient } = await import("../chain.js");
const { decodeCard, verifyCardState } = await import("../cardstate.js");
const app = Fastify();
await app.register(register);
after(async () => { await app.close(); db.close(); });
const verifier = newPinVerifier("123456");
const uid = "aabbccdd";
const uidHash = uidHashOf(uid);
const address = `0x${"3".repeat(40)}`;
db.prepare(`INSERT INTO students
  (uid_hash, student_no, name, address, pin_hash, pin_salt, pin_iter, offline_cap, email, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
  uidHash, "2026-001", "Test Student", address, verifier.hash, verifier.salt,
  verifier.iterations, 10000, "student@umak.edu.ph", Date.now(),
);
const credentials = { uid, email: "student@umak.edu.ph", studentNo: "2026-001", pin: "123456" };
const login = (payload: object, remoteAddress = "127.0.0.1") => app.inject({
  method: "POST", url: "/cards/login", payload, remoteAddress,
});

test("registered students can log in without registering or writing their card again", async () => {
  const response = await login({ ...credentials, email: " STUDENT@UMAK.EDU.PH ", studentNo: " 2026-001 " });
  assert.equal(response.statusCode, 200, response.body);
  assert.deepEqual(response.json(), { uidHash, address, name: "Test Student", studentNo: "2026-001" });
  assert.equal((db.prepare("SELECT COUNT(*) AS n FROM students").get() as { n: number }).n, 1);
});

test("wrong email, student number, and PIN all fail with the same error", async () => {
  for (const payload of [
    { ...credentials, email: "unknown@umak.edu.ph" },
    { ...credentials, studentNo: "wrong" },
    { ...credentials, pin: "000000" },
  ]) {
    const response = await login(payload);
    assert.equal(response.statusCode, 401, response.body);
    assert.deepEqual(response.json(), { error: "INVALID_CREDENTIALS" });
  }
});

test("all three credentials and a six-digit PIN are required", async () => {
  for (const payload of [
    { uid, studentNo: credentials.studentNo, pin: credentials.pin },
    { uid, email: credentials.email, pin: credentials.pin },
    { uid, email: credentials.email, studentNo: credentials.studentNo },
    { ...credentials, pin: "123" },
  ]) assert.equal((await login(payload)).statusCode, 400);
});

test("login attempts are rate limited", async () => {
  for (let i = 0; i < 10; i++) await login({ ...credentials, pin: "000000" }, "127.0.0.2");
  const response = await login(credentials, "127.0.0.2");
  assert.equal(response.statusCode, 429);
  assert.ok(response.headers["retry-after"]);
});

test("tapped IDs are recognized even when their wallet record is missing locally", async () => {
  for (const [uid, registered] of [["aabbccdd", true], ["11223344", false]] as const) {
    const response = await app.inject({ method: "POST", url: "/cards/lookup", payload: { uid } });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), { registered });
  }
});

test("credentials for a different tapped ID are refused", async () => {
  const response = await login({ ...credentials, uid: "11223344" }, "127.0.0.3");
  assert.equal(response.statusCode, 401);
});

test("verified login restores a signed wallet at the actual balance with a fresh nonce", async (t) => {
  const balance = t.mock.method(publicClient, "readContract", async () => 25000n);
  const response = await login({ ...credentials, restoreCard: true }, "127.0.0.4");
  assert.equal(response.statusCode, 200, response.body);
  const restored = response.json();
  assert.equal(restored.balance, 25000);
  assert.equal(restored.nonce, 1);
  const record = decodeCard(restored.card)!;
  assert.equal(record.state.balance, 25000);
  assert.equal(record.state.nonce, 1);
  assert.equal(record.pending, null);
  assert.equal(await verifyCardState(`0x${uidHash}`, record.state), true);
  assert.equal(balance.mock.callCount(), 1);
  assert.equal((db.prepare("SELECT card_nonce FROM students WHERE uid_hash = ?").get(uidHash) as { card_nonce: number }).card_nonce, 1);
});

test("restoration requires valid credentials and never reads the balance on authentication failure", async (t) => {
  const balance = t.mock.method(publicClient, "readContract", async () => 25000n);
  const response = await login({ ...credentials, pin: "000000", restoreCard: true }, "127.0.0.5");
  assert.equal(response.statusCode, 401);
  assert.equal(response.json().card, undefined);
  assert.equal(balance.mock.callCount(), 0);
});

test("blocked cards cannot restore a wallet", async (t) => {
  const balance = t.mock.method(publicClient, "readContract", async () => 25000n);
  db.prepare("UPDATE students SET blocked = 1 WHERE uid_hash = ?").run(uidHash);
  try {
    const response = await login({ ...credentials, restoreCard: true }, "127.0.0.6");
    assert.equal(response.statusCode, 403);
    assert.equal(response.json().error, "CARD_BLOCKED");
    assert.equal(balance.mock.callCount(), 0);
  } finally {
    db.prepare("UPDATE students SET blocked = 0 WHERE uid_hash = ?").run(uidHash);
  }
});

test("restoring a missing record cannot erase a queued payment", async (t) => {
  const balance = t.mock.method(publicClient, "readContract", async () => 25000n);
  db.prepare(`INSERT INTO receipts (id, from_addr, to_addr, amount, created_at, updated_at, card_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)`).run("pending-recovery", address, address, 100, 1, 1, `0x${uidHash}`);
  try {
    const response = await login({ ...credentials, restoreCard: true }, "127.0.0.7");
    assert.equal(response.statusCode, 409);
    assert.equal(response.json().error, "CARD_PENDING");
    assert.equal(balance.mock.callCount(), 0);
  } finally {
    db.prepare("DELETE FROM receipts WHERE id = ?").run("pending-recovery");
  }
});

test("chain errors do not advance the restored card nonce", async (t) => {
  t.mock.method(publicClient, "readContract", async () => { throw new Error("RPC unavailable"); });
  const response = await login({ ...credentials, restoreCard: true }, "127.0.0.8");
  assert.equal(response.statusCode, 502);
  assert.equal(response.json().error, "CHAIN_UNAVAILABLE");
  assert.equal((db.prepare("SELECT card_nonce FROM students WHERE uid_hash = ?").get(uidHash) as { card_nonce: number }).card_nonce, 1);
});

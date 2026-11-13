import assert from "node:assert/strict";
import { after, beforeEach, mock, test } from "node:test";
import Fastify from "fastify";

process.env.DB_PATH = ":memory:";
process.env.RPC_URL = "http://127.0.0.1:1";
process.env.CONTRACT = `0x${"1".repeat(40)}`;
process.env.RELAYER_PRIVATE_KEY = `0x${"1".repeat(64)}`;
process.env.DEPLOYER_PRIVATE_KEY = `0x${"2".repeat(64)}`;
process.env.CASHIER_KEY = "test-cashier";
let balance = 0n;
let mintCount = 0;
let failMint = false;
let failBalance = false;
await mock.module("../chain.js", { namedExports: {
  balanceOf: async () => { if (failBalance) throw new Error("RPC unavailable"); return balance; },
  topUp: async (_cardId: string, amount: bigint) => {
    if (failMint) throw new Error("Mint reverted");
    balance += amount;
    return `0x${(++mintCount).toString(16).padStart(64, "0")}`;
  },
  explorerTx: (hash: string) => `https://test.invalid/tx/${hash}`,
  addMerchant: async () => {}, linkCard: async () => {}, walletOfCard: async () => {}, settle: async () => {},
} });
const { db } = await import("../db.js");
const { uidHashOf, cardIdOf } = await import("../services/directory.js");
const { issueCardState } = await import("../cardstate.js");
const { default: students } = await import("./students.js");
const { default: cards } = await import("./cards.js");
const app = Fastify();
await app.register(students);
await app.register(cards);
after(async () => { await app.close(); db.close(); });
const uid = "aabbccdd";
const address = `0x${"3".repeat(40)}`;
const otherAddress = `0x${"4".repeat(40)}`;
db.prepare(`INSERT INTO students (uid_hash, student_no, name, address, pin_hash, offline_cap, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?)`).run(uidHashOf(uid), "2026-001", "Test Student", address, "unused", 10000, 1);
let card = await issueCardState(cardIdOf(uidHashOf(uid)), 0, 0);
beforeEach(async () => {
  db.exec("DELETE FROM topups; DELETE FROM receipts; UPDATE students SET card_nonce = 0");
  balance = 0n;
  mintCount = 0;
  failMint = false;
  failBalance = false;
  card = await issueCardState(cardIdOf(uidHashOf(uid)), 0, 0);
});
const history = async (query = "") => {
  const response = await app.inject(`/students/${address}/receipts${query}`);
  assert.equal(response.statusCode, 200, response.body);
  return response.json();
};

test("confirmed online and cash top-ups appear with payments in newest-first student activity", async () => {
  for (const method of ["online", "cash"]) {
    const response = await app.inject({ method: "POST", url: method === "cash" ? "/cards/topup/cash" : "/cards/topup",
      headers: { "x-cashier-key": "test-cashier" }, payload: { uid, card, amount: 20000, orNumber: "OR-123" } });
    assert.equal(response.statusCode, 200, response.body);
    card = response.json().card;
    const entry = (await history()).activity.find((r: { txHash: string }) => r.txHash === response.json().txHash);
    assert.ok(entry, "A confirmed top-up must appear in student activity");
    assert.equal(entry.kind, "topup");
    assert.equal(entry.amount, 20000);
    assert.equal(entry.method, method);
    assert.equal(entry.ref, response.json().ref);
    assert.equal(entry.status, "settled");
    assert.equal(entry.explorer, `https://test.invalid/tx/${entry.txHash}`);
  }
  db.prepare(`INSERT INTO receipts (id, from_addr, to_addr, amount, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)`).run("payment", address, otherAddress, 100, Date.now() + 1000, 1);
  db.prepare(`INSERT INTO receipts (id, from_addr, to_addr, amount, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)`).run("other-student", otherAddress, address, 999, Date.now() + 2000, 1);
  const result = await history();
  assert.deepEqual(result.activity.map((r: { kind: string }) => r.kind), ["payment", "topup", "topup"]);
  assert.equal(result.pendingTotal, 100);
  assert.equal(result.receipts.length, 1, "Payment-only clients keep their existing feed");
  assert.equal((await history("?limit=1")).activity.length, 1);
  failMint = true;
  const failed = await app.inject({ method: "POST", url: "/cards/topup", payload: { uid, card, amount: 100 } });
  assert.equal(failed.statusCode, 502);
  assert.equal((await history()).activity.length, 3, "Failed mints do not create credits");
});

test("a confirmed credit remains in history if refreshing the card balance fails", async () => {
  failMint = false;
  failBalance = true;
  const response = await app.inject({ method: "POST", url: "/cards/topup", payload: { uid, card, amount: 100 } });
  assert.equal(response.statusCode, 500);
  const result = await history();
  assert.equal(result.balance, null);
  assert.equal(result.activity.filter((r: { kind: string }) => r.kind === "topup").length, 1);
});

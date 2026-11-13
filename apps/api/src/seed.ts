/**
 * Demo data. Safe to re-run: existing stalls/students are skipped.
 *   pnpm --filter api seed          stalls + demo cards (registered on-chain: spends a little tBNB)
 *   pnpm --filter api seed --fund   also top up each new demo card and settle a few
 *                                   payments on-chain so /me has history (spends tBNB;
 *                                   mints tPHP with OR "SEED-…", outside the cash peg)
 * Real demo cards are still linked through /cashier. Register each stall's POS device
 * with POST /merchants/:id/device before taking real payments.
 */
import { randomUUID } from "node:crypto";
import type { Address } from "viem";
import { balanceOf, topUp } from "./chain.js";
import { config } from "./config.js";
import {
  cardIdOf,
  createMerchant,
  createStudent,
  findMerchantByName,
  findStudentByUid,
  uidHashOf,
} from "./services/directory.js";
import { insertReceipt, settleAndRecord } from "./services/receipts.js";

const fund = process.argv.includes("--fund");

const STALLS = ["Canteen", "Kape Kiosk", "Bookstore", "Print Shop"];
const STUDENTS = [
  { uid: "de:00:00:01", studentNo: "DEMO-0001", name: "Ana Reyes", pin: "1234" },
  { uid: "de:00:00:02", studentNo: "DEMO-0002", name: "Ben Cruz", pin: "1234" },
  { uid: "de:00:00:03", studentNo: "DEMO-0003", name: "Carla Santos", pin: "1234" },
];
const TOP_UP = 20000; // ₱200
const PAYMENTS: [stall: string, centavos: number, minutesAgo: number][] = [
  ["Canteen", 6500, 180],
  ["Kape Kiosk", 3900, 95],
  ["Print Shop", 1200, 20],
];

// Stalls and cards are registered on-chain (addMerchant / linkCard), so seeding spends gas.
const stalls = [];
for (const name of STALLS) stalls.push(findMerchantByName(name) ?? (await createMerchant(name)));
console.log("Stalls:");
for (const s of stalls) console.log(`  ${s.name.padEnd(12)} id=${s.id} address=${s.address} device=${s.device_address ?? "(not registered)"}`);

console.log("Demo cards (PIN 1234; virtual cards, no physical record is written):");
const students = [];
for (const s of STUDENTS) {
  const uidHash = uidHashOf(s.uid);
  const existing = findStudentByUid(uidHash);
  const address = (existing?.address ?? (await createStudent(s)).address) as Address;
  console.log(`  ${s.studentNo} ${s.name.padEnd(13)} uid=${s.uid} wallet=${address}${existing ? " (existing)" : ""}`);
  students.push({ ...s, uidHash, address });
}

if (fund) {
  if (config.chainId !== 31337) console.log(`\nFunding on chain ${config.chainId}: tPHP minted here is NOT backed by cash.`);
  const payments = [];
  for (const s of students) {
    if ((await balanceOf(s.address)) > 0n) {
      console.log(`  ${s.studentNo}: already funded, skipped`);
      continue;
    }
    const cardId = cardIdOf(s.uidHash);
    const hash = await topUp(cardId, BigInt(TOP_UP), `SEED-${s.studentNo}`);
    console.log(`  ${s.studentNo}: topUp ₱${TOP_UP / 100} ${hash}`);
    for (const [stallName, amount, minutesAgo] of PAYMENTS) {
      const stall = stalls.find((m) => m.name === stallName)!;
      const r = insertReceipt({
        id: randomUUID(),
        from: s.address,
        to: stall.address as Address,
        amount,
        createdAt: Date.now() - minutesAgo * 60_000,
        cardId,
        cardNonce: null, // trusted seed history: no POS signature or card state
      });
      payments.push({ id: r.id, cardId, to: stall.address as Address, amount: BigInt(amount) });
    }
  }
  if (payments.length > 0) {
    const results = await settleAndRecord(payments);
    console.log(`  settled ${results.filter((r) => r.status === "settled").length}/${results.length} payments in ${results[0]?.txHash}`);
  }
}

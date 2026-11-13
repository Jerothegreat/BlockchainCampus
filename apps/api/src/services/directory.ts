import { createHash, randomUUID } from "node:crypto";
import { getAddress, type Address, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAddress } from "viem/accounts";
import { issueCardState } from "../cardstate.js";
import { addMerchant, linkCard } from "../chain.js";
import { config } from "../config.js";
import { db } from "../db.js";
import { newPinVerifier } from "../pin.js";

/** Students and stalls. Neither holds keys: the relayer moves funds, so each just needs a unique address. */

export type StudentRow = {
  uid_hash: string;
  student_no: string;
  name: string;
  address: string;
  pin_hash: string;
  pin_salt: string | null;
  pin_iter: number | null;
  offline_cap: number;
  card_nonce: number;
  blocked: number;
};
export type MerchantRow = { id: string; name: string; address: string; device_address: string | null };

// Must match apps/web/src/lib/uid.ts so the POS hashes taps to the same uidHash.
export const normalizeUid = (uid: string) => uid.replace(/[^0-9a-f]/gi, "").toLowerCase();
export const uidHashOf = (uid: string) => createHash("sha256").update(normalizeUid(uid)).digest("hex");
/** On-chain card id = the uidHash as bytes32. */
export const cardIdOf = (uidHash: string) => `0x${uidHash}` as Hex;
export const uidHashOfCardId = (cardId: string) => cardId.replace(/^0x/, "").toLowerCase();

const newAddress = () => privateKeyToAddress(generatePrivateKey()); // key discarded on purpose

const insertStudent = db.prepare(
  `INSERT INTO students (uid_hash, student_no, name, address, pin_hash, pin_salt, pin_iter, offline_cap, created_at)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
);
const studentByUid = db.prepare("SELECT * FROM students WHERE uid_hash = ?");
const studentByNo = db.prepare("SELECT 1 FROM students WHERE student_no = ?");
const setNonce = db.prepare("UPDATE students SET card_nonce = ? WHERE uid_hash = ?");
const blockStmt = db.prepare("UPDATE students SET blocked = 1, offline_cap = 0 WHERE uid_hash = ?");
const studentByAddress = db.prepare("SELECT * FROM students WHERE address = ?");
const allStudents = db.prepare("SELECT * FROM students ORDER BY student_no");
const insertMerchant = db.prepare("INSERT INTO merchants (id, name, address, device_address) VALUES (?, ?, ?, ?)");
const setDevice = db.prepare("UPDATE merchants SET device_address = ? WHERE id = ?");
const merchantById = db.prepare("SELECT * FROM merchants WHERE id = ?");
const merchantByAddress = db.prepare("SELECT * FROM merchants WHERE address = ?");
const merchantByName = db.prepare("SELECT * FROM merchants WHERE name = ?");
const merchantByDevice = db.prepare("SELECT 1 FROM merchants WHERE device_address = ?");
const allMerchants = db.prepare("SELECT * FROM merchants ORDER BY name");

export class DuplicateError extends Error {}

const isUniqueViolation = (err: unknown) => String((err as Error)?.message).includes("UNIQUE");

/** Registers a card: new wallet, immutable on-chain link (card → wallet), PIN verifier, initial card state. */
export async function createStudent(input: { uid: string; studentNo: string; name?: string; pin: string }) {
  const uidHash = uidHashOf(input.uid);
  if (findStudentByUid(uidHash) || studentByNo.get(input.studentNo)) throw new DuplicateError("ALREADY_LINKED");
  const address = newAddress();
  const pin = newPinVerifier(input.pin);
  const linkTx = await linkCard(cardIdOf(uidHash), address); // before the DB insert: chain is the source of truth
  try {
    insertStudent.run(
      uidHash,
      input.studentNo,
      input.name ?? input.studentNo,
      address,
      pin.hash,
      pin.salt,
      pin.iterations,
      config.defaultOfflineCap,
      Date.now(),
    );
  } catch (err) {
    if (isUniqueViolation(err)) throw new DuplicateError("ALREADY_LINKED");
    throw err;
  }
  const card = await issueCardState(cardIdOf(uidHash), 0, 0);
  return { uidHash, studentNo: input.studentNo, address, linkTx, card };
}

export async function createMerchant(name: string, deviceAddress?: string): Promise<MerchantRow> {
  const merchant = { id: randomUUID(), name, address: newAddress(), device_address: deviceAddress ? getAddress(deviceAddress) : null };
  if (merchant.device_address && merchantByDevice.get(merchant.device_address)) throw new DuplicateError("DEVICE_IN_USE");
  await addMerchant(merchant.address); // on-chain: only registered stalls can receive payments
  try {
    insertMerchant.run(merchant.id, merchant.name, merchant.address, merchant.device_address);
  } catch (err) {
    if (isUniqueViolation(err)) throw new DuplicateError("DEVICE_IN_USE");
    throw err;
  }
  return merchant;
}

/** Registers (or rotates) the POS phone key that signs this stall's receipts. Returns false if no such stall. */
export function setMerchantDevice(id: string, deviceAddress: string): boolean {
  try {
    return setDevice.run(getAddress(deviceAddress), id).changes > 0;
  } catch (err) {
    if (isUniqueViolation(err)) throw new DuplicateError("DEVICE_IN_USE");
    throw err;
  }
}

export const findStudentByUid = (uidHash: string) => studentByUid.get(uidHash) as StudentRow | undefined;
export const findStudentByAddress = (address: Address) => studentByAddress.get(address) as StudentRow | undefined;
export const listStudents = () => allStudents.all() as StudentRow[];
export const findMerchant = (id: string) => merchantById.get(id) as MerchantRow | undefined;
export const findMerchantByAddress = (address: Address) => merchantByAddress.get(address) as MerchantRow | undefined;
export const findMerchantByName = (name: string) => merchantByName.get(name) as MerchantRow | undefined;
export const listMerchants = () => allMerchants.all() as MerchantRow[];

export const merchantView = (m: MerchantRow) => ({ id: m.id, name: m.name, address: m.address, deviceAddress: m.device_address });

/** Records that a new card state with this nonce was issued. */
export const saveCardNonce = (uidHash: string, nonce: number) => setNonce.run(nonce, uidHash);
/** Cloned / rolled-back card: block it everywhere (POS gets `blocked` via /sync, cap drops to 0). */
export const blockCard = (uidHash: string) => blockStmt.run(uidHash);

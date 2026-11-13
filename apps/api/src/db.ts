import { DatabaseSync } from "node:sqlite";
import { config } from "./config.js";

export const db = new DatabaseSync(config.dbPath);

db.exec(`
  PRAGMA journal_mode = WAL;

  CREATE TABLE IF NOT EXISTS students (
    uid_hash     TEXT PRIMARY KEY,
    student_no   TEXT NOT NULL UNIQUE,
    name         TEXT NOT NULL,
    address      TEXT NOT NULL UNIQUE,
    pin_hash     TEXT NOT NULL,
    offline_cap  INTEGER NOT NULL,
    created_at   INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS merchants (
    id       TEXT PRIMARY KEY,
    name     TEXT NOT NULL,
    address  TEXT NOT NULL UNIQUE
  );

  CREATE TABLE IF NOT EXISTS receipts (
    id          TEXT PRIMARY KEY,            -- UUID from the POS
    from_addr   TEXT NOT NULL,
    to_addr     TEXT NOT NULL,
    amount      INTEGER NOT NULL,            -- centavos
    status      TEXT NOT NULL DEFAULT 'pending', -- pending | settled | failed
    reason      TEXT,
    tx_hash     TEXT,
    created_at  INTEGER NOT NULL,
    updated_at  INTEGER NOT NULL
  );
`);

// Additive migrations for databases created by earlier versions.
function addColumn(table: string, column: string, definition: string) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!columns.some((c) => c.name === column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

addColumn("students", "pin_salt", "TEXT"); // hex, PBKDF2 salt (null = legacy sha256 PIN)
addColumn("students", "pin_iter", "INTEGER");
addColumn("merchants", "device_address", "TEXT"); // POS phone's signing key address
addColumn("receipts", "sig", "TEXT"); // EIP-712 signature from the stall's POS device
addColumn("students", "card_nonce", "INTEGER NOT NULL DEFAULT 0"); // nonce of the latest card state issued
addColumn("students", "blocked", "INTEGER NOT NULL DEFAULT 0"); // 1 = cloned/rolled-back card detected
addColumn("receipts", "card_id", "TEXT"); // 0x + uidHash
addColumn("receipts", "card_nonce", "INTEGER"); // card state nonce the POS saw (null = seed/legacy)

db.exec(`
  CREATE UNIQUE INDEX IF NOT EXISTS merchants_device ON merchants(device_address);
  CREATE INDEX IF NOT EXISTS receipts_from ON receipts(from_addr, created_at);
  CREATE INDEX IF NOT EXISTS receipts_card ON receipts(card_id, card_nonce);
`);

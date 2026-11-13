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

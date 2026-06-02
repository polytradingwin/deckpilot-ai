import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const outputDir = path.resolve(process.cwd(), "output");
fs.mkdirSync(outputDir, { recursive: true });

const dbPath = process.env.DATABASE_PATH || path.join(outputDir, "deckpilot.sqlite");
const db = new DatabaseSync(dbPath);

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    credits_total INTEGER NOT NULL,
    credits_used INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS generations (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    filename TEXT NOT NULL,
    stored_filename TEXT NOT NULL,
    created_at TEXT NOT NULL,
    slide_count INTEGER NOT NULL,
    source TEXT NOT NULL,
    purpose TEXT NOT NULL,
    style TEXT NOT NULL,
    language TEXT NOT NULL,
    audience TEXT NOT NULL,
    size INTEGER NOT NULL,
    credit_cost INTEGER NOT NULL
  );
`);

export function getDb() {
  return db;
}

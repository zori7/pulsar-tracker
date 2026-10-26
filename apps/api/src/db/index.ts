import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import type BetterSqlite3 from 'better-sqlite3';

export type DB = BetterSqlite3.Database;

/**
 * Schema per SPEC §3. Idempotent (IF NOT EXISTS) so it can run on every boot.
 * `sent_notifications` keeps the UNIQUE(client_id, item_id, date, kind) dedupe
 * constraint from the spec. NOTE: SQLite treats NULLs as distinct in UNIQUE
 * indexes, so digest rows (item_id NULL) are deduped in application code via a
 * NULL-safe `item_id IS ?` check (see db/sent.ts).
 */
const SCHEMA = `
CREATE TABLE IF NOT EXISTS items (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  schedule TEXT NOT NULL,
  reminder_time TEXT,
  archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_items_client ON items(client_id);

CREATE TABLE IF NOT EXISTS completions (
  item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  status TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(item_id, date)
);
CREATE INDEX IF NOT EXISTS idx_completions_date ON completions(date);

CREATE TABLE IF NOT EXISTS settings (
  client_id TEXT PRIMARY KEY,
  ntfy_topic TEXT NOT NULL,
  ntfy_server TEXT NOT NULL,
  notifications_enabled INTEGER NOT NULL DEFAULT 1,
  digest_time TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sent_notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id TEXT NOT NULL,
  item_id TEXT,
  date TEXT NOT NULL,
  kind TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(client_id, item_id, date, kind)
);
`;

/** Opens (creating parent dirs as needed) and migrates the SQLite database. */
export function openDatabase(databasePath: string): DB {
  if (databasePath !== ':memory:') {
    const dir = path.dirname(path.resolve(databasePath));
    fs.mkdirSync(dir, { recursive: true });
  }
  const db = new Database(databasePath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  db.exec(SCHEMA);
  return db;
}

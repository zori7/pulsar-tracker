import type { Completion, CompletionStatus, ISODate } from '@pulsar/shared';
import type { DB } from './index.js';

export interface CompletionRow {
  item_id: string;
  date: string;
  status: string;
  updated_at: string;
}

export function completionFromRow(row: CompletionRow): Completion {
  return {
    itemId: row.item_id,
    date: row.date,
    status: row.status as CompletionStatus,
    updatedAt: row.updated_at,
  };
}

/** Completions of one client's items within [since, until] (inclusive). */
export function listCompletionRows(db: DB, clientId: string, since: ISODate, until: ISODate): CompletionRow[] {
  return db
    .prepare(
      `SELECT c.item_id, c.date, c.status, c.updated_at
       FROM completions c
       JOIN items i ON i.id = c.item_id
       WHERE i.client_id = ? AND c.date >= ? AND c.date <= ?
       ORDER BY c.date, c.item_id`,
    )
    .all(clientId, since, until) as CompletionRow[];
}

export function upsertCompletionRow(
  db: DB,
  itemId: string,
  date: ISODate,
  status: CompletionStatus,
  updatedAt: string,
): void {
  db.prepare(
    `INSERT INTO completions (item_id, date, status, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(item_id, date) DO UPDATE SET status = excluded.status, updated_at = excluded.updated_at`,
  ).run(itemId, date, status, updatedAt);
}

export function getCompletionRow(db: DB, itemId: string, date: ISODate): CompletionRow | undefined {
  return db
    .prepare('SELECT item_id, date, status, updated_at FROM completions WHERE item_id = ? AND date = ?')
    .get(itemId, date) as CompletionRow | undefined;
}

export function deleteCompletionRow(db: DB, itemId: string, date: ISODate): void {
  db.prepare('DELETE FROM completions WHERE item_id = ? AND date = ?').run(itemId, date);
}

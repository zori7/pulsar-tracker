import type { Completion, CompletionStatus, ISODate } from '@pulsar/shared';
import type { DB } from '../db/index.js';
import {
  completionFromRow,
  deleteCompletionRow,
  getCompletionRow,
  listCompletionRows,
  upsertCompletionRow,
} from '../db/completions.js';
import { requireItem } from './items.js';

export function listCompletions(db: DB, clientId: string, since: ISODate, until: ISODate): Completion[] {
  return listCompletionRows(db, clientId, since, until).map(completionFromRow);
}

/** Any calendar date is allowed — no range checks (backfill / pre-skip). */
export function setCompletion(
  db: DB,
  clientId: string,
  itemId: string,
  date: ISODate,
  status: CompletionStatus,
  now = new Date(),
): Completion {
  requireItem(db, clientId, itemId);
  upsertCompletionRow(db, itemId, date, status, now.toISOString());
  const row = getCompletionRow(db, itemId, date);
  if (!row) throw new Error('completion upsert failed');
  return completionFromRow(row);
}

/** Idempotent delete: 204 even when nothing was recorded. */
export function removeCompletion(db: DB, clientId: string, itemId: string, date: ISODate): void {
  requireItem(db, clientId, itemId);
  deleteCompletionRow(db, itemId, date);
}

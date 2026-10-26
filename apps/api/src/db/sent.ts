import type { ISODate } from '@pulsar/shared';
import type { DB } from './index.js';

export type NotificationKind = 'item' | 'digest';

/**
 * NULL-safe existence check. Uses `item_id IS ?` because SQLite's UNIQUE
 * constraint treats NULLs as distinct — digests (item_id NULL) would otherwise
 * never dedupe at the index level.
 */
export function wasSent(db: DB, clientId: string, itemId: string | null, date: ISODate, kind: NotificationKind): boolean {
  const row = db
    .prepare('SELECT 1 AS present FROM sent_notifications WHERE client_id = ? AND item_id IS ? AND date = ? AND kind = ?')
    .get(clientId, itemId, date, kind);
  return row !== undefined;
}

/**
 * Records the notification attempt (dedupe marker). Returns false when the
 * (client, item, date, kind) attempt was already recorded — callers must then
 * skip sending.
 */
export function markSent(
  db: DB,
  clientId: string,
  itemId: string | null,
  date: ISODate,
  kind: NotificationKind,
  now = new Date(),
): boolean {
  const tx = db.transaction((): boolean => {
    if (wasSent(db, clientId, itemId, date, kind)) return false;
    db.prepare(
      'INSERT INTO sent_notifications (client_id, item_id, date, kind, created_at) VALUES (?, ?, ?, ?, ?)',
    ).run(clientId, itemId, date, kind, now.toISOString());
    return true;
  });
  return tx();
}

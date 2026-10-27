import type { DB } from './index.js';

/** When the last notification tick ran, or null before the first one. */
export function getLastTickAt(db: DB): Date | null {
  const row = db.prepare('SELECT last_tick_at FROM tick_state WHERE id = 1').get() as
    | { last_tick_at: string }
    | undefined;
  return row ? new Date(row.last_tick_at) : null;
}

export function setLastTickAt(db: DB, at: Date): void {
  db.prepare(
    'INSERT INTO tick_state (id, last_tick_at) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET last_tick_at = excluded.last_tick_at',
  ).run(at.toISOString());
}

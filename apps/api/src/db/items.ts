import type { Item, Schedule } from '@pulsar/shared';
import type { DB } from './index.js';

export interface ItemRow {
  id: string;
  client_id: string;
  kind: string;
  title: string;
  description: string | null;
  schedule: string; // JSON of Schedule
  reminder_time: string | null;
  archived: number;
  created_at: string;
  updated_at: string;
}

export function itemFromRow(row: ItemRow): Item {
  return {
    id: row.id,
    clientId: row.client_id,
    kind: row.kind as Item['kind'],
    title: row.title,
    description: row.description,
    schedule: JSON.parse(row.schedule) as Schedule,
    reminderTime: row.reminder_time,
    archived: row.archived === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function insertItem(db: DB, item: Item): void {
  db.prepare(
    `INSERT INTO items (id, client_id, kind, title, description, schedule, reminder_time, archived, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    item.id,
    item.clientId,
    item.kind,
    item.title,
    item.description,
    JSON.stringify(item.schedule),
    item.reminderTime,
    item.archived ? 1 : 0,
    item.createdAt,
    item.updatedAt,
  );
}

export function getItemRow(db: DB, id: string): ItemRow | undefined {
  return db.prepare('SELECT * FROM items WHERE id = ?').get(id) as ItemRow | undefined;
}

/** All items of a client (archived included), oldest first. */
export function listItemRows(db: DB, clientId: string): ItemRow[] {
  return db.prepare('SELECT * FROM items WHERE client_id = ? ORDER BY created_at, id').all(clientId) as ItemRow[];
}

export interface ItemPatch {
  title?: string;
  description?: string | null;
  schedule?: Schedule;
  reminderTime?: string | null;
  archived?: boolean;
}

/** Partial update; only provided fields are written. Returns true if a row changed. */
export function updateItemRow(db: DB, id: string, patch: ItemPatch, updatedAt: string): boolean {
  const sets: string[] = [];
  const values: unknown[] = [];
  if (patch.title !== undefined) {
    sets.push('title = ?');
    values.push(patch.title);
  }
  if (patch.description !== undefined) {
    sets.push('description = ?');
    values.push(patch.description);
  }
  if (patch.schedule !== undefined) {
    sets.push('schedule = ?');
    values.push(JSON.stringify(patch.schedule));
  }
  if (patch.reminderTime !== undefined) {
    sets.push('reminder_time = ?');
    values.push(patch.reminderTime);
  }
  if (patch.archived !== undefined) {
    sets.push('archived = ?');
    values.push(patch.archived ? 1 : 0);
  }
  if (sets.length === 0) return false;
  sets.push('updated_at = ?');
  values.push(updatedAt, id);
  const info = db.prepare(`UPDATE items SET ${sets.join(', ')} WHERE id = ?`).run(...values);
  return info.changes > 0;
}

export function deleteItemRow(db: DB, id: string): void {
  db.prepare('DELETE FROM items WHERE id = ?').run(id);
}

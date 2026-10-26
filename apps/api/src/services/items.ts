import { randomUUID } from 'node:crypto';
import { validateSchedule } from '@pulsar/shared';
import type { Item, ItemKind, Schedule } from '@pulsar/shared';
import type { DB } from '../db/index.js';
import { deleteItemRow, getItemRow, insertItem, itemFromRow, listItemRows, updateItemRow } from '../db/items.js';
import { NotFoundError, ValidationError } from '../http/errors.js';

export interface CreateItemInput {
  kind: ItemKind;
  title: string;
  description?: string | null;
  schedule: Schedule;
  reminderTime?: string | null;
  archived?: boolean;
}

/** Domain validation (todo→once, ranges…) happens here — throws ValidationError. */
export function createItem(db: DB, clientId: string, input: CreateItemInput, now = new Date()): Item {
  const details = validateSchedule(input.schedule, input.kind);
  if (details.length > 0) throw new ValidationError(details);
  const timestamp = now.toISOString();
  const item: Item = {
    id: randomUUID(),
    clientId,
    kind: input.kind,
    title: input.title,
    description: input.description ?? null,
    schedule: input.schedule,
    reminderTime: input.reminderTime ?? null,
    archived: input.archived ?? false,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  insertItem(db, item);
  return item;
}

/** 404 for missing ids AND ids belonging to another client (no data leaks). */
export function requireItem(db: DB, clientId: string, id: string): Item {
  const row = getItemRow(db, id);
  if (!row || row.client_id !== clientId) throw new NotFoundError('item not found');
  return itemFromRow(row);
}

export function listItems(db: DB, clientId: string): Item[] {
  return listItemRows(db, clientId).map(itemFromRow);
}

export interface UpdateItemInput {
  title?: string;
  description?: string | null;
  schedule?: Schedule;
  reminderTime?: string | null;
  archived?: boolean;
}

export function updateItem(db: DB, clientId: string, id: string, patch: UpdateItemInput, now = new Date()): Item {
  const existing = requireItem(db, clientId, id);
  if (patch.schedule !== undefined) {
    const details = validateSchedule(patch.schedule, existing.kind);
    if (details.length > 0) throw new ValidationError(details);
  }
  updateItemRow(db, id, patch, now.toISOString());
  return requireItem(db, clientId, id);
}

export function deleteItemForClient(db: DB, clientId: string, id: string): void {
  requireItem(db, clientId, id);
  deleteItemRow(db, id);
}

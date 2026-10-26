import { Router } from 'express';
import type { Request } from 'express';
import { addDays, isISODate, todayISO } from '@pulsar/shared';
import type { ISODate } from '@pulsar/shared';
import type { DB } from '../db/index.js';
import { completionFromRow } from '../db/completions.js';
import { NotFoundError, ValidationError } from '../http/errors.js';
import { removeCompletion, setCompletion, listCompletions } from '../services/completions.js';
import { createItem, deleteItemForClient, listItems, requireItem, updateItem } from '../services/items.js';
import { completionSchema, createItemSchema, patchItemSchema, zodDetails } from '../validation/schemas.js';

/** Validates a `?since=`/`?until=`/:date value; undefined → null (use default). */
function readDate(value: unknown, name: string): ISODate | null {
  if (value === undefined) return null;
  if (typeof value !== 'string' || !isISODate(value)) {
    throw new ValidationError([`${name} must be YYYY-MM-DD`]);
  }
  return value;
}

export function itemsRouter(db: DB): Router {
  const router = Router();

  // GET /api/items → completions in [today-365, today+60], ?since/?until override.
  router.get('/', (req: Request, res) => {
    const today = todayISO();
    const since = readDate(req.query.since, 'since') ?? addDays(today, -365);
    const until = readDate(req.query.until, 'until') ?? addDays(today, 60);
    const items = listItems(db, req.clientId);
    const completions = listCompletions(db, req.clientId, since, until);
    res.json({ items, completions });
  });

  // POST /api/items → 201
  router.post('/', (req: Request, res) => {
    const parsed = createItemSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'validation', details: zodDetails(parsed.error) });
      return;
    }
    const item = createItem(db, req.clientId, parsed.data);
    res.status(201).json({ item });
  });

  // GET /api/items/:id
  router.get('/:id', (req: Request<{ id: string }>, res) => {
    const item = requireItem(db, req.clientId, req.params.id);
    res.json({ item });
  });

  // PATCH /api/items/:id (partial)
  router.patch('/:id', (req: Request<{ id: string }>, res) => {
    const parsed = patchItemSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'validation', details: zodDetails(parsed.error) });
      return;
    }
    const item = updateItem(db, req.clientId, req.params.id, parsed.data);
    res.json({ item });
  });

  // DELETE /api/items/:id → 204 (completions cascade at the SQL level)
  router.delete('/:id', (req: Request<{ id: string }>, res) => {
    deleteItemForClient(db, req.clientId, req.params.id);
    res.status(204).end();
  });

  // PUT /api/items/:id/completions/:date — ANY calendar date, no range checks.
  router.put('/:id/completions/:date', (req: Request<{ id: string; date: string }>, res) => {
    const parsed = completionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'validation', details: zodDetails(parsed.error) });
      return;
    }
    const date = readDate(req.params.date, 'date') as ISODate;
    const completion = setCompletion(db, req.clientId, req.params.id, date, parsed.data.status);
    res.json({ completion });
  });

  // DELETE /api/items/:id/completions/:date → 204 (idempotent)
  router.delete('/:id/completions/:date', (req: Request<{ id: string; date: string }>, res) => {
    const date = readDate(req.params.date, 'date') as ISODate;
    removeCompletion(db, req.clientId, req.params.id, date);
    res.status(204).end();
  });

  // Safety net for /api/items/* paths that fell through the routers above.
  router.use((req) => {
    throw new NotFoundError(`no route for ${req.method} ${req.path}`);
  });

  return router;
}

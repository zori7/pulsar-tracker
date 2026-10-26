import { isDue, nowHHMM, todayISO } from '@pulsar/shared';
import type { ISODate } from '@pulsar/shared';
import type { DB } from '../db/index.js';
import { itemFromRow, type ItemRow } from '../db/items.js';
import { getCompletionRow } from '../db/completions.js';
import type { SettingsRow } from '../db/settings.js';
import { markSent, wasSent } from '../db/sent.js';
import { digestMessage, itemReminderMessage, clickUrl, type DigestEntryStatus } from '../notifications/messages.js';
import type { SendFn } from '../notifications/transport.js';

export interface TickResult {
  itemRemindersSent: number;
  digestsSent: number;
  failures: number;
}

/**
 * One notification tick (SPEC §5). Pure of BullMQ: takes a `send` transport so
 * tests can stub it. `appUrl` (optional) is the web app's public base URL — it
 * turns every notification into a deep link (ntfy `Click` action). Never throws
 * — per-client and per-send failures are logged and counted; sent_notifications
 * rows mark attempts (dedupe).
 */
export async function runTick(
  db: DB,
  send: SendFn,
  now: Date = new Date(),
  appUrl = '',
): Promise<TickResult> {
  const today: ISODate = todayISO(now);
  const hhmm = nowHHMM(now);
  const result: TickResult = { itemRemindersSent: 0, digestsSent: 0, failures: 0 };

  const clients = db.prepare('SELECT * FROM settings WHERE notifications_enabled = 1').all() as SettingsRow[];
  for (const client of clients) {
    try {
      await tickClient(db, client, today, hhmm, now, send, result, appUrl);
    } catch (err) {
      console.error(`[worker] tick failed for client ${client.client_id}:`, err);
    }
  }
  return result;
}

async function tickClient(
  db: DB,
  settings: SettingsRow,
  today: ISODate,
  hhmm: string,
  now: Date,
  send: SendFn,
  result: TickResult,
  appUrl = '',
): Promise<void> {
  const clientId = settings.client_id;

  // 1. Per-item reminders: due today, not archived, reminderTime === now.
  const reminderRows = db
    .prepare('SELECT * FROM items WHERE client_id = ? AND archived = 0 AND reminder_time = ?')
    .all(clientId, hhmm) as ItemRow[];
  for (const row of reminderRows) {
    const item = itemFromRow(row);
    if (!isDue(item.schedule, today)) continue;
    // Attempt is recorded BEFORE sending → dedupe; failures are recorded too (spec).
    if (!markSent(db, clientId, item.id, today, 'item', now)) continue;
    const { title, message } = itemReminderMessage(item.title, item.description);
    // Tap-through lands on that day with this item's sheet open over Today.
    const click = clickUrl(appUrl, `/?date=${today}&item=${item.id}`);
    try {
      await send({
        server: settings.ntfy_server,
        topic: settings.ntfy_topic,
        title,
        message,
        tags: 'alarm_clock',
        priority: 'high',
        ...(click ? { click } : {}),
      });
      result.itemRemindersSent += 1;
    } catch (err) {
      result.failures += 1;
      console.error(`[worker] reminder for "${item.title}" failed:`, err);
    }
  }

  // 2. Daily digest: only at digestTime, only once per client per day.
  if (hhmm !== settings.digest_time) return;
  if (wasSent(db, clientId, null, today, 'digest')) return;

  const dueRows = db
    .prepare('SELECT * FROM items WHERE client_id = ? AND archived = 0')
    .all(clientId) as ItemRow[];
  const entries: Array<{ title: string; status: DigestEntryStatus }> = [];
  for (const row of dueRows) {
    const item = itemFromRow(row);
    if (!isDue(item.schedule, today)) continue;
    const completion = getCompletionRow(db, item.id, today);
    const raw = completion?.status;
    const status: DigestEntryStatus = raw === 'done' ? 'done' : raw === 'skipped' ? 'skipped' : 'pending';
    entries.push({ title: item.title, status });
  }
  if (entries.length === 0) return;
  // Gate: at least one still-to-do due item. `done` and `skipped` are both handled
  // (skipped = acknowledged, per the shared streak semantics) → no nag.
  if (!entries.some((entry) => entry.status === 'pending')) return;

  if (!markSent(db, clientId, null, today, 'digest', now)) return;
  const { title, message } = digestMessage(today, entries);
  // Tap-through lands on today's list.
  const click = clickUrl(appUrl, `/?date=${today}`);
  try {
    await send({
      server: settings.ntfy_server,
      topic: settings.ntfy_topic,
      title,
      message,
      tags: 'calendar',
      priority: 'default',
      ...(click ? { click } : {}),
    });
    result.digestsSent += 1;
  } catch (err) {
    result.failures += 1;
    console.error(`[worker] digest failed for client ${clientId}:`, err);
  }
}

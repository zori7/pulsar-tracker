import { describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import { nowHHMM, todayISO, weekdayOf } from '@pulsar/shared';
import type { Weekday } from '@pulsar/shared';
import { openDatabase, type DB } from '../src/db/index.js';
import { ensureSettingsRow, updateSettingsRow, getSettingsRow } from '../src/db/settings.js';
import { wasSent } from '../src/db/sent.js';
import { setLastTickAt } from '../src/db/ticks.js';
import { createItem } from '../src/services/items.js';
import { setCompletion } from '../src/services/completions.js';
import { runTick } from '../src/worker/tick.js';
import type { SendFn } from '../src/notifications/transport.js';

/** Fixed local wall-clock: 2026-01-15 08:30 local. */
const reminderNow = new Date(2026, 0, 15, 8, 30, 0, 0);
const digestNow = new Date(2026, 0, 15, 9, 15, 0, 0);
const today = todayISO(reminderNow);

function makeDb(): DB {
  return openDatabase(':memory:');
}

function makeSend(): { send: Mock<SendFn>; fn: SendFn } {
  const send = vi.fn<SendFn>().mockResolvedValue(undefined);
  return { send, fn: send };
}

describe('notification tick (dedupe via sent_notifications)', () => {
  it('sends one item reminder when reminderTime falls in the tick window, and only once', async () => {
    const db = makeDb();
    ensureSettingsRow(db, 'c1', { topic: 'topic-1', server: 'https://ntfy.example', digestTime: '09:15' }, reminderNow);
    const habit = createItem(
      db,
      'c1',
      {
        kind: 'habit',
        title: 'Drink water',
        schedule: { type: 'weekdays', weekdays: [weekdayOf(today)] },
        reminderTime: '08:30',
      },
      reminderNow,
    );
    const { send, fn } = makeSend();

    const first = await runTick(db, fn, reminderNow);
    expect(first.itemRemindersSent).toBe(1);
    expect(first.failures).toBe(0);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        topic: 'topic-1',
        server: 'https://ntfy.example',
        message: `⏰ ${'Drink water'} is due today`,
      }),
    );

    // Same minute, second tick → deduped.
    const second = await runTick(db, fn, reminderNow);
    expect(second.itemRemindersSent).toBe(0);
    expect(send).toHaveBeenCalledTimes(1);
    expect(wasSent(db, 'c1', habit.id, today, 'item')).toBe(true);

    db.close();
  });

  it('does not send a reminder for an item that is not due today or has another reminderTime', async () => {
    const db = makeDb();
    ensureSettingsRow(db, 'c1', { topic: 't', server: 'https://ntfy.example', digestTime: '23:59' }, reminderNow);
    // Due today but reminder at 22:00.
    createItem(
      db,
      'c1',
      {
        kind: 'habit',
        title: 'Later',
        schedule: { type: 'weekdays', weekdays: [weekdayOf(today)] },
        reminderTime: '22:00',
      },
      reminderNow,
    );
    // Matching time but due only on Sundays (any weekday ≠ today in general) —
    // pick a weekday definitely not today by choosing the opposite of today's weekday.
    const notToday = ((weekdayOf(today) + 3) % 7) as Weekday;
    createItem(
      db,
      'c1',
      {
        kind: 'habit',
        title: 'Wrong day',
        schedule: { type: 'weekdays', weekdays: [notToday] },
        reminderTime: '08:30',
      },
      reminderNow,
    );

    const { send, fn } = makeSend();
    const result = await runTick(db, fn, reminderNow);
    expect(send).not.toHaveBeenCalled();
    expect(result.itemRemindersSent).toBe(0);

    db.close();
  });

  it('sends the digest once with ☐/☑ markers, deduped across ticks', async () => {
    const db = makeDb();
    ensureSettingsRow(db, 'c1', { topic: 'topic-1', server: 'https://ntfy.example', digestTime: '09:15' }, reminderNow);
    const due = { type: 'weekdays' as const, weekdays: [weekdayOf(today)] };
    createItem(db, 'c1', { kind: 'habit', title: 'Stretch', schedule: due }, reminderNow);
    const todo = createItem(db, 'c1', { kind: 'todo', title: 'Call mom', schedule: { type: 'once', date: today } }, reminderNow);
    // The todo is already done; the habit is not → digest is "due-and-unfinished".
    setCompletion(db, 'c1', todo.id, today, 'done', reminderNow);

    const { send, fn } = makeSend();

    // Not digest time yet → nothing.
    expect((await runTick(db, fn, reminderNow)).digestsSent).toBe(0);
    expect(send).not.toHaveBeenCalled();

    // At digestTime → single digest listing both items with markers.
    const atDigest = await runTick(db, fn, digestNow);
    expect(atDigest.digestsSent).toBe(1);
    expect(send).toHaveBeenCalledTimes(1);
    const msg = send.mock.calls[0]?.[0];
    expect(msg?.topic).toBe('topic-1');
    const lines = (msg?.message ?? '').split('\n');
    expect(lines).toHaveLength(2);
    expect(lines).toContain('☐ Stretch');
    expect(lines).toContain('☑ Call mom');

    // Second tick at the same minute → deduped (digest has item_id NULL).
    const again = await runTick(db, fn, digestNow);
    expect(again.digestsSent).toBe(0);
    expect(send).toHaveBeenCalledTimes(1);
    expect(wasSent(db, 'c1', null, today, 'digest')).toBe(true);

    db.close();
  });

  it('skips the digest when every due item is already done or skipped', async () => {
    const db = makeDb();
    ensureSettingsRow(db, 'c1', { topic: 't', server: 'https://ntfy.example', digestTime: '09:15' }, reminderNow);
    const todo = createItem(db, 'c1', { kind: 'todo', title: 'Done thing', schedule: { type: 'once', date: today } }, reminderNow);
    setCompletion(db, 'c1', todo.id, today, 'done', reminderNow);
    // Skipped is acknowledged (neutral) too — no nag for a pre-skipped day.
    const habit = createItem(
      db,
      'c1',
      { kind: 'habit', title: 'Skipped thing', schedule: { type: 'weekdays', weekdays: [weekdayOf(today)] } },
      reminderNow,
    );
    setCompletion(db, 'c1', habit.id, today, 'skipped', reminderNow);

    const { send, fn } = makeSend();
    const result = await runTick(db, fn, digestNow);
    expect(result.digestsSent).toBe(0);
    expect(send).not.toHaveBeenCalled();

    db.close();
  });

  it('records failed attempts and never throws out of the tick', async () => {
    const db = makeDb();
    ensureSettingsRow(db, 'c1', { topic: 't', server: 'https://ntfy.example', digestTime: '09:15' }, reminderNow);
    createItem(
      db,
      'c1',
      {
        kind: 'habit',
        title: 'Doomed',
        schedule: { type: 'weekdays', weekdays: [weekdayOf(today)] },
        reminderTime: '08:30',
      },
      reminderNow,
    );

    const send = vi.fn<SendFn>().mockRejectedValue(new Error('ntfy down'));
    // Suppress the expected [worker] error log noise.
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      await expect(runTick(db, send as SendFn, reminderNow)).resolves.toMatchObject({ failures: 1 });

      // Attempt was recorded → no retry on the next tick, still no throw.
      const retry = await runTick(db, send as SendFn, reminderNow);
      expect(retry.failures).toBe(0);
      expect(send).toHaveBeenCalledTimes(1);
    } finally {
      errorSpy.mockRestore();
    }

    db.close();
  });

  it('ignores clients with notifications disabled and archived items', async () => {
    const db = makeDb();
    ensureSettingsRow(db, 'c1', { topic: 't', server: 'https://ntfy.example', digestTime: '09:15' }, reminderNow);
    updateSettingsRow(db, 'c1', { notificationsEnabled: false }, new Date().toISOString());
    createItem(
      db,
      'c1',
      {
        kind: 'habit',
        title: 'Muted client',
        schedule: { type: 'weekdays', weekdays: [weekdayOf(today)] },
        reminderTime: '08:30',
      },
      reminderNow,
    );

    ensureSettingsRow(db, 'c2', { topic: 't2', server: 'https://ntfy.example', digestTime: '09:15' }, reminderNow);
    const archived = createItem(
      db,
      'c2',
      {
        kind: 'habit',
        title: 'Archived',
        schedule: { type: 'weekdays', weekdays: [weekdayOf(today)] },
        reminderTime: '08:30',
        archived: true,
      },
      reminderNow,
    );
    expect(archived.archived).toBe(true);

    const { send, fn } = makeSend();
    const result = await runTick(db, fn, reminderNow);
    expect(send).not.toHaveBeenCalled();
    expect(result.itemRemindersSent).toBe(0);

    db.close();
  });

  it('uses server-local time (todayISO/nowHHMM) for its comparisons', async () => {
    const db = makeDb();
    ensureSettingsRow(db, 'c1', { topic: 't', server: 'https://ntfy.example', digestTime: '15:45' }, reminderNow);
    createItem(
      db,
      'c1',
      {
        kind: 'habit',
        title: 'Local time',
        schedule: { type: 'weekdays', weekdays: [weekdayOf(today)] },
        reminderTime: nowHHMM(digestNow),
      },
      reminderNow,
    );
    const { send, fn } = makeSend();
    const result = await runTick(db, fn, digestNow);
    expect(result.itemRemindersSent).toBe(1);
    expect(getSettingsRow(db, 'c1')?.digest_time).toBe('15:45');
    db.close();
  });

  it('attaches deep-link click URLs when an appUrl is configured', async () => {
    const db = makeDb();
    ensureSettingsRow(db, 'c1', { topic: 't', server: 'https://ntfy.example', digestTime: '09:15' }, reminderNow);
    createItem(
      db,
      'c1',
      {
        kind: 'habit',
        title: 'Drink water',
        schedule: { type: 'weekdays', weekdays: [weekdayOf(today)] },
        reminderTime: '08:30',
      },
      reminderNow,
    );
    const { send, fn } = makeSend();

    // Item reminder → that day's Today list (no item sheet).
    // Trailing slash on the base must not survive into the URL.
    await runTick(db, fn, reminderNow, 'http://homebox:8700/');
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        click: `http://homebox:8700/?date=${today}`,
      }),
    );

    // Digest → today's list.
    await runTick(db, fn, digestNow, 'http://homebox:8700/');
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        tags: 'calendar',
        click: `http://homebox:8700/?date=${today}`,
      }),
    );

    db.close();
  });

  it('sends no click action at all when no appUrl is configured', async () => {
    const db = makeDb();
    ensureSettingsRow(db, 'c1', { topic: 't', server: 'https://ntfy.example', digestTime: '09:15' }, reminderNow);
    createItem(
      db,
      'c1',
      {
        kind: 'habit',
        title: 'Drink water',
        schedule: { type: 'weekdays', weekdays: [weekdayOf(today)] },
        reminderTime: '08:30',
      },
      reminderNow,
    );
    const { send, fn } = makeSend();

    await runTick(db, fn, reminderNow);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(expect.not.objectContaining({ click: expect.anything() }));

    db.close();
  });

  describe('catch-up window', () => {
    const everyDay = { type: 'weekdays' as const, weekdays: [0, 1, 2, 3, 4, 5, 6] as Weekday[] };

    function seed(db: DB, reminderTimes: string[], digestTime = '23:59'): void {
      ensureSettingsRow(db, 'c1', { topic: 't', server: 'https://ntfy.example', digestTime }, reminderNow);
      for (const reminderTime of reminderTimes) {
        createItem(db, 'c1', { kind: 'habit', title: `At ${reminderTime}`, schedule: everyDay, reminderTime }, reminderNow);
      }
    }

    it('catches up reminders from minutes the tick missed', async () => {
      const db = makeDb();
      seed(db, ['08:30']);
      setLastTickAt(db, new Date(2026, 0, 15, 8, 28));
      const { fn } = makeSend();

      const result = await runTick(db, fn, new Date(2026, 0, 15, 8, 32));
      expect(result.itemRemindersSent).toBe(1);

      db.close();
    });

    it('sends reminders and the digest missed during downtime earlier today', async () => {
      const db = makeDb();
      seed(db, ['08:30'], '09:15');
      setLastTickAt(db, new Date(2026, 0, 15, 8, 0));
      const { fn } = makeSend();

      const result = await runTick(db, fn, new Date(2026, 0, 15, 10, 0));
      expect(result.itemRemindersSent).toBe(1);
      expect(result.digestsSent).toBe(1);

      db.close();
    });

    it('does not fire times before the window (e.g. a reminder set earlier than now)', async () => {
      const db = makeDb();
      seed(db, ['08:30', '15:00'], '09:15');
      const { send, fn } = makeSend();

      // First tick ever → one-minute window; then the regular next minute.
      await runTick(db, fn, new Date(2026, 0, 15, 14, 59));
      expect(send).not.toHaveBeenCalled();
      const result = await runTick(db, fn, new Date(2026, 0, 15, 15, 0));
      expect(result.itemRemindersSent).toBe(1);
      expect(result.digestsSent).toBe(0);
      expect(send).toHaveBeenCalledTimes(1);

      db.close();
    });

    it("never carries yesterday's missed reminders past midnight", async () => {
      const db = makeDb();
      seed(db, ['23:55', '00:03']);
      setLastTickAt(db, new Date(2026, 0, 14, 23, 50));
      const { send, fn } = makeSend();

      const result = await runTick(db, fn, new Date(2026, 0, 15, 0, 5));
      expect(result.itemRemindersSent).toBe(1);
      expect(send).toHaveBeenCalledWith(expect.objectContaining({ message: '⏰ At 00:03 is due today' }));

      db.close();
    });

    it('sends nothing when the clock moves backwards', async () => {
      const db = makeDb();
      seed(db, ['08:30']);
      setLastTickAt(db, new Date(2026, 0, 15, 9, 0));
      const { send, fn } = makeSend();

      await runTick(db, fn, new Date(2026, 0, 15, 8, 30));
      expect(send).not.toHaveBeenCalled();

      db.close();
    });
  });
});

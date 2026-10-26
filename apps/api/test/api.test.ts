import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { schedules, startTestServer, type TestServer } from './helpers.js';

let server: TestServer;

beforeEach(async () => {
  server = await startTestServer();
});

afterEach(async () => {
  await server.close();
});

describe('client id scoping', () => {
  it('rejects requests without x-client-id with 400 missing-client-id', async () => {
    const res = await server.api('GET', '/api/items', { clientId: null });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'missing-client-id' });

    const blank = await server.api('GET', '/api/items', { clientId: '   ' });
    expect(blank.status).toBe(400);
    expect(await blank.json()).toEqual({ error: 'missing-client-id' });

    const health = await server.api('GET', '/api/health', { clientId: null });
    expect(health.status).toBe(200); // health is the one open route (liveness)
    expect(await health.json()).toEqual({ ok: true });
  });

  it("returns 404 for another client's item id", async () => {
    const created = await server.api('POST', '/api/items', {
      body: { kind: 'habit', title: 'A private habit', schedule: schedules.weekdays([1, 3, 5]) },
    });
    expect(created.status).toBe(201);
    const { item } = (await created.json()) as { item: { id: string } };

    // Same client can read it.
    expect((await server.api('GET', `/api/items/${item.id}`)).status).toBe(200);

    // Another client: 404 on every item route.
    const asB = { clientId: 'client-b' };
    expect((await server.api('GET', `/api/items/${item.id}`, asB)).status).toBe(404);
    expect((await server.api('PATCH', `/api/items/${item.id}`, { ...asB, body: { title: 'stolen' } })).status).toBe(404);
    expect((await server.api('DELETE', `/api/items/${item.id}`, asB)).status).toBe(404);
    expect(
      (await server.api('PUT', `/api/items/${item.id}/completions/2026-01-01`, { ...asB, body: { status: 'done' } }))
        .status,
    ).toBe(404);
    expect(
      (await server.api('DELETE', `/api/items/${item.id}/completions/2026-01-01`, asB)).status,
    ).toBe(404);

    // And client B's list is empty.
    const list = (await (await server.api('GET', '/api/items', asB)).json()) as { items: unknown[] };
    expect(list.items).toHaveLength(0);
  });

  it('separates settings per client id', async () => {
    const a = (await (await server.api('GET', '/api/settings')).json()) as { settings: { clientId: string } };
    const b = (await (
      await server.api('GET', '/api/settings', { clientId: 'client-b' })
    ).json()) as { settings: { clientId: string } };
    expect(a.settings.clientId).toBe('client-a');
    expect(b.settings.clientId).toBe('client-b');
  });
});

describe('item creation validation', () => {
  it('accepts every schedule type on a habit', async () => {
    const cases = [
      schedules.once('2026-05-01'),
      schedules.weekdays([1, 3, 5]),
      schedules.monthdays([1, 15]),
      schedules.interval(3, '2026-01-01'),
      schedules.cycle(5, [true, true, false, false, false], '2026-01-01'),
    ];
    for (const schedule of cases) {
      const res = await server.api('POST', '/api/items', {
        body: { kind: 'habit', title: `habit ${schedule.type}`, schedule, reminderTime: '08:30' },
      });
      expect(res.status, JSON.stringify(schedule)).toBe(201);
      const { item } = (await res.json()) as { item: { schedule: unknown; reminderTime: string } };
      expect(item.schedule).toEqual(schedule);
      expect(item.reminderTime).toBe('08:30');
    }
  });

  it('enforces the todo → once rule', async () => {
    const rejected = await server.api('POST', '/api/items', {
      body: { kind: 'todo', title: 'bad todo', schedule: schedules.weekdays([1]) },
    });
    expect(rejected.status).toBe(400);
    const body = (await rejected.json()) as { error: string; details: string[] };
    expect(body.error).toBe('validation');
    expect(body.details).toContain('todos must use a one-time schedule');

    const accepted = await server.api('POST', '/api/items', {
      body: { kind: 'todo', title: 'good todo', schedule: schedules.once('2026-02-02') },
    });
    expect(accepted.status).toBe(201);
  });

  it('rejects malformed schedules with 400 validation', async () => {
    const cases = [
      // cycle.pattern length ≠ cycle.length
      { kind: 'habit', title: 'x', schedule: schedules.cycle(3, [true, false], '2026-01-01') },
      // cycle with no active day
      { kind: 'habit', title: 'x', schedule: schedules.cycle(3, [false, false, false], '2026-01-01') },
      // weekdays out of range
      { kind: 'habit', title: 'x', schedule: schedules.weekdays([7]) },
      // empty monthdays
      { kind: 'habit', title: 'x', schedule: schedules.monthdays([]) },
      // interval.every < 1
      { kind: 'habit', title: 'x', schedule: schedules.interval(0, '2026-01-01') },
      // unknown type
      { kind: 'habit', title: 'x', schedule: { type: 'weekly' } },
    ];
    for (const body of cases) {
      const res = await server.api('POST', '/api/items', { body });
      expect(res.status, JSON.stringify(body)).toBe(400);
      const parsed = (await res.json()) as { error: string; details: string[] };
      expect(parsed.error).toBe('validation');
      expect(parsed.details.length).toBeGreaterThan(0);
    }
  });

  it('rejects empty title, bad reminderTime and malformed bodies', async () => {
    const noTitle = await server.api('POST', '/api/items', {
      body: { kind: 'habit', title: '   ', schedule: schedules.weekdays([0]) },
    });
    expect(noTitle.status).toBe(400);

    const badReminder = await server.api('POST', '/api/items', {
      body: { kind: 'habit', title: 'x', schedule: schedules.weekdays([0]), reminderTime: '25:99' },
    });
    expect(badReminder.status).toBe(400);

    const badJson = await server.api('POST', '/api/items', { rawBody: '{nope' });
    expect(badJson.status).toBe(400);
    expect(((await badJson.json()) as { error: string }).error).toBe('validation');
  });
});

describe('completions accept any calendar date', () => {
  it('PUTs a past date, a future date, then DELETEs', async () => {
    const created = await server.api('POST', '/api/items', {
      body: { kind: 'habit', title: 'Stretch', schedule: schedules.weekdays([1, 2, 3, 4, 5, 6, 0]) },
    });
    const { item } = (await created.json()) as { item: { id: string } };

    // Past backfill (well beyond the default [today-365, today+60] window).
    const past = await server.api('PUT', `/api/items/${item.id}/completions/2019-03-07`, {
      body: { status: 'done' },
    });
    expect(past.status).toBe(200);
    expect(await past.json()).toEqual({
      completion: { itemId: item.id, date: '2019-03-07', status: 'done', updatedAt: expect.any(String) },
    });

    // Future pre-skip.
    const future = await server.api('PUT', `/api/items/${item.id}/completions/2031-12-25`, {
      body: { status: 'skipped' },
    });
    expect(future.status).toBe(200);
    expect(((await future.json()) as { completion: { status: string } }).completion.status).toBe('skipped');

    // Overwrite keeps the same row (upsert).
    const overwrite = await server.api('PUT', `/api/items/${item.id}/completions/2019-03-07`, {
      body: { status: 'skipped' },
    });
    expect(overwrite.status).toBe(200);
    expect(((await overwrite.json()) as { completion: { status: string } }).completion.status).toBe('skipped');

    // Range behavior of GET /api/items: default window excludes 2019/2031,
    // an explicit ?since/?until override picks them up.
    const def = (await (await server.api('GET', '/api/items')).json()) as {
      completions: Array<{ date: string }>;
    };
    expect(def.completions.some((c) => c.date === '2019-03-07')).toBe(false);
    expect(def.completions.some((c) => c.date === '2031-12-25')).toBe(false);

    const wide = (await (
      await server.api('GET', '/api/items?since=2018-01-01&until=2032-01-01')
    ).json()) as { completions: Array<{ date: string; status: string }> };
    expect(wide.completions.map((c) => c.date).sort()).toEqual(['2019-03-07', '2031-12-25']);

    // DELETE → 204, and deleting again is still 204 (idempotent).
    expect((await server.api('DELETE', `/api/items/${item.id}/completions/2019-03-07`)).status).toBe(204);
    expect((await server.api('DELETE', `/api/items/${item.id}/completions/2019-03-07`)).status).toBe(204);

    const afterDelete = (await (
      await server.api('GET', '/api/items?since=2018-01-01&until=2032-01-01')
    ).json()) as { completions: Array<{ date: string }> };
    expect(afterDelete.completions.map((c) => c.date)).toEqual(['2031-12-25']);

    // Invalid date/params → 400 validation.
    expect(
      (await server.api('PUT', `/api/items/${item.id}/completions/2019-13-01`, { body: { status: 'done' } })).status,
    ).toBe(400);
    expect((await server.api('GET', '/api/items?since=yesterday')).status).toBe(400);
  });

  it('deleting an item cascades to its completions', async () => {
    const created = await server.api('POST', '/api/items', {
      body: { kind: 'todo', title: 'One-off', schedule: schedules.once('2026-03-03') },
    });
    const { item } = (await created.json()) as { item: { id: string } };
    await server.api('PUT', `/api/items/${item.id}/completions/2026-03-03`, { body: { status: 'done' } });

    expect((await server.api('DELETE', `/api/items/${item.id}`)).status).toBe(204);
    expect((await server.api('GET', `/api/items/${item.id}`)).status).toBe(404);

    const rows = server.db
      .prepare('SELECT COUNT(*) AS n FROM completions WHERE item_id = ?')
      .get(item.id) as { n: number };
    expect(rows.n).toBe(0);
  });
});

describe('settings', () => {
  it('auto-provisions defaults on first GET and accepts partial PUT', async () => {
    const first = (await (await server.api('GET', '/api/settings')).json()) as { settings: unknown };
    expect(first.settings).toEqual({
      clientId: 'client-a',
      ntfyTopic: 'pulsar-tracker',
      ntfyServer: 'https://ntfy.sh',
      notificationsEnabled: true,
      digestTime: '09:00',
    });

    const patched = (await (
      await server.api('PUT', '/api/settings', { body: { ntfyTopic: 'my-topic' } })
    ).json()) as { settings: Record<string, unknown> };
    expect(patched.settings.ntfyTopic).toBe('my-topic');
    // partial update leaves everything else intact
    expect(patched.settings.ntfyServer).toBe('https://ntfy.sh');
    expect(patched.settings.digestTime).toBe('09:00');
    expect(patched.settings.notificationsEnabled).toBe(true);

    const disabled = (await (
      await server.api('PUT', '/api/settings', { body: { notificationsEnabled: false, digestTime: '21:30' } })
    ).json()) as { settings: Record<string, unknown> };
    expect(disabled.settings.notificationsEnabled).toBe(false);
    expect(disabled.settings.digestTime).toBe('21:30');
    expect(disabled.settings.ntfyTopic).toBe('my-topic');

    const bad = await server.api('PUT', '/api/settings', { body: { digestTime: '9am' } });
    expect(bad.status).toBe(400);
    expect(((await bad.json()) as { error: string }).error).toBe('validation');
  });
});

describe('POST /api/notifications/test', () => {
  it('sends through the configured transport and reports 202 on success', async () => {
    await server.api('PUT', '/api/settings', { body: { ntfyTopic: 'test-topic', ntfyServer: 'https://ntfy.example' } });
    const res = await server.api('POST', '/api/notifications/test');
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ sent: true, ok: true });
    expect(server.send).toHaveBeenCalledTimes(1);
    expect(server.send).toHaveBeenCalledWith(
      expect.objectContaining({
        server: 'https://ntfy.example',
        topic: 'test-topic',
        message: expect.stringContaining('Test notification'),
      }),
    );
  });

  it('reports transport failures with 202 { sent: false, ok: false, error }', async () => {
    server.send.mockRejectedValueOnce(new Error('connection refused'));
    const res = await server.api('POST', '/api/notifications/test');
    expect(res.status).toBe(202);
    const body = (await res.json()) as { sent: boolean; ok: boolean; error?: string };
    expect(body.sent).toBe(false);
    expect(body.ok).toBe(false);
    expect(body.error).toContain('connection refused');
  });
});

describe('health', () => {
  it('GET /api/health → { ok: true }', async () => {
    const res = await server.api('GET', '/api/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});

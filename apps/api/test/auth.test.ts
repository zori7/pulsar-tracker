import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { schedules, sessionCookieFrom, startTestServer, TEST_PASSWORD, type TestServer } from './helpers.js';

let server: TestServer;

beforeEach(async () => {
  server = await startTestServer();
});

afterEach(async () => {
  await server.close();
});

function post(path: string, body: unknown, headers: Record<string, string> = {}) {
  return server.api('POST', path, { as: null, body, headers });
}

describe('auth', () => {
  it('signs up, sets an HttpOnly session cookie and reports /me', async () => {
    const res = await post('/api/auth/signup', { username: 'zori', password: TEST_PASSWORD });
    expect(res.status).toBe(201);
    const { user } = (await res.json()) as { user: { id: string; username: string } };
    expect(user.username).toBe('zori');

    const setCookie = res.headers.getSetCookie().join('\n');
    expect(setCookie).toMatch(/pulsar_session=/);
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=Lax/i);
    expect(setCookie).toMatch(/Path=\/api/);

    const me = await server.api('GET', '/api/auth/me', { as: null, headers: { cookie: sessionCookieFrom(res) } });
    expect(me.status).toBe(200);
    expect(await me.json()).toEqual({ user });

    // Raw password is never stored.
    const row = server.db.prepare('SELECT password_hash FROM users WHERE id = ?').get(user.id) as {
      password_hash: string;
    };
    expect(row.password_hash).toMatch(/^scrypt\$/);
    expect(row.password_hash).not.toContain(TEST_PASSWORD);
  });

  it('rejects duplicate usernames case-insensitively with 409', async () => {
    expect((await post('/api/auth/signup', { username: 'Zori', password: TEST_PASSWORD })).status).toBe(201);
    const dup = await post('/api/auth/signup', { username: 'zori', password: 'another password' });
    expect(dup.status).toBe(409);
    expect(((await dup.json()) as { error: string }).error).toBe('username-taken');
  });

  it('validates credentials', async () => {
    const res = await post('/api/auth/signup', { username: 'a b', password: 'short' });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string; details: string[] };
    expect(body.error).toBe('validation');
    expect(body.details.length).toBe(2);
  });

  it('logs in from a second device and sees the same data', async () => {
    // "Safari" signs up and creates an item.
    const signup = await post('/api/auth/signup', { username: 'zori', password: TEST_PASSWORD });
    const safari = { as: null, headers: { cookie: sessionCookieFrom(signup) } };
    const created = await server.api('POST', '/api/items', {
      ...safari,
      body: { kind: 'habit', title: 'Read', schedule: schedules.weekdays([1]) },
    });
    expect(created.status).toBe(201);

    // The home-screen PWA (separate cookie jar) logs in with the same credentials.
    expect((await post('/api/auth/login', { username: 'zori', password: 'wrong password' })).status).toBe(401);
    expect((await post('/api/auth/login', { username: 'nobody', password: TEST_PASSWORD })).status).toBe(401);
    const login = await post('/api/auth/login', { username: 'ZORI', password: TEST_PASSWORD });
    expect(login.status).toBe(200);
    const pwa = { as: null, headers: { cookie: sessionCookieFrom(login) } };

    const list = (await (await server.api('GET', '/api/items', pwa)).json()) as { items: Array<{ title: string }> };
    expect(list.items.map((i) => i.title)).toEqual(['Read']);

    // Logging out one device leaves the other signed in.
    expect((await server.api('POST', '/api/auth/logout', pwa)).status).toBe(204);
    expect((await server.api('GET', '/api/items', pwa)).status).toBe(401);
    expect((await server.api('GET', '/api/items', safari)).status).toBe(200);
  });

  it('lets the first signup from a pre-accounts browser claim its legacy client id', async () => {
    const legacyId = 'legacy-browser-id';
    server.db
      .prepare(
        `INSERT INTO items (id, client_id, kind, title, description, schedule, reminder_time, archived, created_at, updated_at)
         VALUES ('i1', ?, 'habit', 'Old habit', NULL, '{"type":"weekdays","weekdays":[1]}', NULL, 0, 'x', 'x')`,
      )
      .run(legacyId);

    const first = await post(
      '/api/auth/signup',
      { username: 'zori', password: TEST_PASSWORD },
      { 'x-client-id': legacyId },
    );
    const { user } = (await first.json()) as { user: { id: string } };
    expect(user.id).toBe(legacyId);
    const items = (await (
      await server.api('GET', '/api/items', { as: null, headers: { cookie: sessionCookieFrom(first) } })
    ).json()) as { items: Array<{ title: string }> };
    expect(items.items.map((i) => i.title)).toEqual(['Old habit']);

    // A second account can't take over the same id.
    const second = await post(
      '/api/auth/signup',
      { username: 'intruder', password: TEST_PASSWORD },
      { 'x-client-id': legacyId },
    );
    expect(((await second.json()) as { user: { id: string } }).user.id).not.toBe(legacyId);

    // Ids with no data are never adopted (no squatting on guessed ids).
    const fresh = await post(
      '/api/auth/signup',
      { username: 'fresh', password: TEST_PASSWORD },
      { 'x-client-id': 'unused-id' },
    );
    expect(((await fresh.json()) as { user: { id: string } }).user.id).not.toBe('unused-id');
  });
});

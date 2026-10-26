import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { vi } from 'vitest';
import type { Mock } from 'vitest';
import { createApp } from '../src/app.js';
import { openDatabase, type DB } from '../src/db/index.js';
import { readEnv } from '../src/env.js';
import type { SendFn } from '../src/notifications/transport.js';

export interface TestRequestOptions {
  /** Username to act as (signed up on first use); `null` sends no session. Default: 'client-a'. */
  as?: string | null;
  /** Extra request headers (e.g. a raw cookie or legacy x-client-id). */
  headers?: Record<string, string>;
  body?: unknown;
  /** Override content-type (e.g. send a raw invalid JSON string). */
  rawBody?: string;
}

export interface TestServer {
  base: string;
  db: DB;
  /** Transport stub passed into createApp. */
  send: Mock<SendFn>;
  api(method: string, path: string, opts?: TestRequestOptions): Promise<Response>;
  /** Signs `username` up (once) and returns its session cookie + user id. */
  login(username: string): Promise<{ cookie: string; userId: string }>;
  close(): Promise<void>;
}

export async function startTestServer(): Promise<TestServer> {
  const dir = mkdtempSync(path.join(tmpdir(), 'pulsar-api-'));
  const db = openDatabase(path.join(dir, 'pulsar.db'));
  const send = vi.fn<SendFn>().mockResolvedValue(undefined);
  const app = createApp(db, { env: readEnv({}), send });

  const server: Server = app.listen(0);
  await new Promise<void>((resolve, reject) => {
    server.once('listening', () => resolve());
    server.once('error', reject);
  });
  const { port } = server.address() as AddressInfo;
  const base = `http://127.0.0.1:${port}`;

  const sessions = new Map<string, { cookie: string; userId: string }>();

  async function login(username: string) {
    const cached = sessions.get(username);
    if (cached) return cached;
    const res = await fetch(`${base}/api/auth/signup`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username, password: TEST_PASSWORD }),
    });
    if (res.status !== 201) throw new Error(`test signup failed for ${username}: ${res.status}`);
    const { user } = (await res.json()) as { user: { id: string } };
    const session = { cookie: sessionCookieFrom(res), userId: user.id };
    sessions.set(username, session);
    return session;
  }

  return {
    base,
    db,
    send,
    login,
    api: async (method, path, opts = {}) => {
      const headers: Record<string, string> = {};
      if (opts.as !== null) headers.cookie = (await login(opts.as ?? 'client-a')).cookie;
      Object.assign(headers, opts.headers);
      let body: string | undefined;
      if (opts.rawBody !== undefined) {
        headers['content-type'] = 'application/json';
        body = opts.rawBody;
      } else if (opts.body !== undefined) {
        headers['content-type'] = 'application/json';
        body = JSON.stringify(opts.body);
      }
      return fetch(base + path, { method, headers, body });
    },
    close: async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      db.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

export const TEST_PASSWORD = 'correct horse battery';

/** `name=value` of the session cookie from a response's Set-Cookie. */
export function sessionCookieFrom(res: Response): string {
  const cookie = res.headers.getSetCookie().find((c) => c.startsWith('pulsar_session='));
  if (!cookie) throw new Error('no session cookie in response');
  return cookie.split(';')[0]!;
}

/** Valid schedule fixtures, one per type (SPEC §2). */
export const schedules = {
  once: (date: string) => ({ type: 'once' as const, date }),
  weekdays: (weekdays: number[]) => ({ type: 'weekdays' as const, weekdays }),
  monthdays: (monthdays: number[]) => ({ type: 'monthdays' as const, monthdays }),
  interval: (every: number, anchor: string) => ({ type: 'interval' as const, every, anchor }),
  cycle: (length: number, pattern: boolean[], anchor: string) => ({
    type: 'cycle' as const,
    length,
    pattern,
    anchor,
  }),
};

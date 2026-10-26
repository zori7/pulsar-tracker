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
  /** Header value; `null` omits the header entirely. Default: 'client-a'. */
  clientId?: string | null;
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

  return {
    base,
    db,
    send,
    api: (method, path, opts = {}) => {
      const headers: Record<string, string> = {};
      if (opts.clientId !== null) headers['x-client-id'] = opts.clientId ?? 'client-a';
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

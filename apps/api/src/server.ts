import type { Server } from 'node:http';
import { createApp } from './app.js';
import { openDatabase } from './db/index.js';
import { readEnv } from './env.js';
import { startReminderWorker } from './worker/queue.js';

const env = readEnv();

// SQLite: WAL + foreign_keys + idempotent schema, DATABASE_PATH (default ./data/pulsar.db).
const db = openDatabase(env.databasePath);

const app = createApp(db, { env });

// BullMQ worker in the same process. Redis being down must never block the API:
// startReminderWorker logs and returns null / lets ioredis reconnect.
const reminderWorker = startReminderWorker(db, env);

const server: Server = app.listen(env.port, () => {
  console.log(`[api] Pulsar Tracker API listening on port ${env.port} (db: ${env.databasePath})`);
});

server.on('error', (err) => {
  console.error('[api] server error:', err);
  process.exit(1);
});

let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[api] ${signal} received, shutting down`);
  server.close();
  // BullMQ's close() can block forever when Redis is unreachable — race it
  // against a short timeout so SIGTERM/SIGINT always terminates the process.
  await Promise.race([
    (async () => {
      try {
        await reminderWorker?.close();
      } catch (err) {
        console.error('[worker] error while closing:', err);
      }
    })(),
    new Promise<void>((resolve) => {
      setTimeout(resolve, 3000).unref();
    }),
  ]);
  try {
    db.close();
  } catch (err) {
    console.error('[db] error while closing:', err);
  }
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

// Last-resort net per SPEC §5: a notification or Redis hiccup must never take
// the API down — catches async stream/emitter errors that escape a transport
// guard (the same class of failure as an unhandled EPIPE on a spawned child).
process.on('uncaughtException', (err) => {
  console.error('[api] uncaughtException (kept alive):', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[api] unhandledRejection (kept alive):', reason);
});

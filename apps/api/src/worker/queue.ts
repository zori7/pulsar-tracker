import { Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import type { DB } from '../db/index.js';
import type { Env } from '../env.js';
import { createTransport } from '../notifications/transport.js';
import { runTick } from './tick.js';

const QUEUE_NAME = 'pulsar-tick';
const SCHEDULER_ID = 'tick-every-minute';

export interface ReminderWorkerHandle {
  queue: Queue;
  worker: Worker;
  connection: Redis;
  close(): Promise<void>;
}

/**
 * BullMQ queue + worker in the same process as Express (SPEC §5).
 * A missing/unreachable Redis must NOT take down the HTTP API: connection
 * errors are logged, ioredis keeps reconnecting, and `startReminderWorker`
 * returns null instead of throwing.
 */
export function startReminderWorker(db: DB, env: Env): ReminderWorkerHandle | null {
  try {
    const connection = new Redis(env.redisUrl, { maxRetriesPerRequest: null });
    connection.on('error', (err: Error) => {
      console.error(`[redis] connection problem (${env.redisUrl}) — API keeps serving, retrying: ${err.message}`);
    });

    const queue = new Queue(QUEUE_NAME, { connection });
    queue.on('error', (err: Error) => console.error('[redis] queue error:', err.message));

    const send = createTransport(env);
    const worker = new Worker(
      QUEUE_NAME,
      async () => {
        try {
          await runTick(db, send, new Date(), env.appUrl);
        } catch (err) {
          console.error('[worker] tick crashed (swallowed):', err);
        }
      },
      { connection },
    );
    worker.on('error', (err: Error) => console.error('[redis] worker error:', err.message));

    void registerScheduler(queue, env.redisUrl);

    return {
      queue,
      worker,
      connection,
      close: async () => {
        await worker.close();
        await queue.close();
        try {
          connection.disconnect();
        } catch {
          /* already gone */
        }
      },
    };
  } catch (err) {
    console.error('[redis] reminder worker disabled — failed to initialise:', err);
    return null;
  }
}

/** Repeatable `tick` job every minute (server-local time; TZ respected by BullMQ). */
async function registerScheduler(queue: Queue, redisUrl: string): Promise<void> {
  for (;;) {
    try {
      await queue.upsertJobScheduler(SCHEDULER_ID, { pattern: '* * * * *' }, { name: 'tick', data: { kind: 'tick' } });
      console.log('[worker] tick scheduler registered (every minute)');
      return;
    } catch (err) {
      console.error(
        `[worker] could not register tick scheduler at ${redisUrl} — retrying in 30s:`,
        err instanceof Error ? err.message : err,
      );
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 30_000).unref();
      });
    }
  }
}

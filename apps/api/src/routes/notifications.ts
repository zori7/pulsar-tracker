import { Router } from 'express';
import type { Request } from 'express';
import type { DB } from '../db/index.js';
import { ensureSettingsRow } from '../db/settings.js';
import { DEFAULT_DIGEST_TIME, type Env } from '../env.js';
import { testMessage, clickUrl } from '../notifications/messages.js';
import type { SendFn } from '../notifications/transport.js';

export function notificationsRouter(db: DB, env: Env, send: SendFn): Router {
  const router = Router();

  // POST /api/notifications/test → 202 { sent, ok, error? } — really sends one message.
  router.post('/test', async (req: Request, res) => {
    const settings = ensureSettingsRow(db, req.clientId, {
      topic: env.ntfyDefaultTopic,
      server: env.ntfyServer,
      digestTime: DEFAULT_DIGEST_TIME,
    });
    const { title, message } = testMessage();
    const click = clickUrl(env.appUrl, '/');
    try {
      await send({
        server: settings.ntfy_server,
        topic: settings.ntfy_topic,
        title,
        message,
        tags: 'bell',
        priority: 'default',
        ...(click ? { click } : {}),
      });
      res.status(202).json({ sent: true, ok: true });
    } catch (err) {
      res.status(202).json({
        sent: false,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  return router;
}

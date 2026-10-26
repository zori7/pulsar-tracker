import express from 'express';
import type { Express, NextFunction, Request, Response } from 'express';
import type { DB } from './db/index.js';
import { readEnv, type Env } from './env.js';
import { sessionMiddleware } from './http/session.js';
import { NotFoundError, ValidationError } from './http/errors.js';
import { createTransport, type SendFn } from './notifications/transport.js';
import { authRouter } from './routes/auth.js';
import { itemsRouter } from './routes/items.js';
import { notificationsRouter } from './routes/notifications.js';
import { settingsRouter } from './routes/settings.js';

export interface AppDeps {
  env?: Env;
  /** Transport override (tests inject a stub). */
  send?: SendFn;
}

export function createApp(db: DB, deps: AppDeps = {}): Express {
  const env = deps.env ?? readEnv();
  const send = deps.send ?? createTransport(env);

  const app = express();
  app.disable('x-powered-by');
  // nginx terminates the client connection; trust it for req.secure (cookie flag).
  app.set('trust proxy', 'loopback, uniquelocal');
  app.use(express.json());

  // Liveness — open (no session), for Docker/probes/curl.
  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ ok: true });
  });

  // Signup/login/logout are open; /me checks the session itself.
  app.use('/api/auth', authRouter(db));

  // Every other /api route requires a session cookie (SPEC §4).
  app.use('/api', sessionMiddleware(db));

  app.use('/api/items', itemsRouter(db));
  app.use('/api/settings', settingsRouter(db, env));
  app.use('/api/notifications', notificationsRouter(db, env, send));

  // Unknown /api routes.
  app.use('/api', (_req: Request, res: Response) => {
    res.status(404).json({ error: 'not-found' });
  });

  // Central error translation: services throw ValidationError/NotFoundError.
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof ValidationError) {
      res.status(400).json({ error: 'validation', details: err.details });
      return;
    }
    if (err instanceof NotFoundError) {
      res.status(404).json({ error: 'not-found' });
      return;
    }
    if (err instanceof SyntaxError && 'body' in err) {
      res.status(400).json({ error: 'validation', details: ['invalid JSON body'] });
      return;
    }
    console.error('[api] unhandled error:', err);
    res.status(500).json({ error: 'internal' });
  });

  return app;
}

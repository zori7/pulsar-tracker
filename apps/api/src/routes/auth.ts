import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import type { Request, Response } from 'express';
import { hashPassword, verifyPassword } from '../auth/password.js';
import type { DB } from '../db/index.js';
import {
  canClaimLegacyClientId,
  createSession,
  deleteSession,
  getUserByUsername,
  insertUser,
  userFromRow,
} from '../db/users.js';
import {
  clearSessionCookie,
  readSessionToken,
  sessionMiddleware,
  setSessionCookie,
} from '../http/session.js';
import { credentialsSchema, zodDetails } from '../validation/schemas.js';

/** Burned on unknown usernames so login timing doesn't reveal which exist. */
const DUMMY_HASH = hashPassword('pulsar-dummy-password');

export function authRouter(db: DB): Router {
  const router = Router();

  function parseCredentials(req: Request, res: Response) {
    const parsed = credentialsSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'validation', details: zodDetails(parsed.error) });
      return null;
    }
    return parsed.data;
  }

  function startSession(req: Request, res: Response, userId: string): void {
    setSessionCookie(req, res, createSession(db, userId));
  }

  // POST /api/auth/signup → 201 { user }. A legacy `x-client-id` header lets the
  // first account made from a pre-accounts browser keep that browser's data.
  router.post('/signup', async (req, res) => {
    const creds = parseCredentials(req, res);
    if (!creds) return;
    const legacyId = req.get('x-client-id')?.trim();
    const id = legacyId && canClaimLegacyClientId(db, legacyId) ? legacyId : randomUUID();
    const passwordHash = await hashPassword(creds.password);
    const user = insertUser(db, { id, username: creds.username, passwordHash });
    if (!user) {
      res.status(409).json({ error: 'username-taken', details: ['That username is taken.'] });
      return;
    }
    startSession(req, res, user.id);
    res.status(201).json({ user: userFromRow(user) });
  });

  // POST /api/auth/login → 200 { user } | 401 invalid-credentials.
  router.post('/login', async (req, res) => {
    const creds = parseCredentials(req, res);
    if (!creds) return;
    const user = getUserByUsername(db, creds.username);
    const ok = await verifyPassword(creds.password, user?.password_hash ?? (await DUMMY_HASH));
    if (!user || !ok) {
      res.status(401).json({ error: 'invalid-credentials', details: ['Wrong username or password.'] });
      return;
    }
    startSession(req, res, user.id);
    res.json({ user: userFromRow(user) });
  });

  // POST /api/auth/logout → 204. Idempotent; works without a valid session.
  router.post('/logout', (req, res) => {
    const token = readSessionToken(req);
    if (token) deleteSession(db, token);
    clearSessionCookie(req, res);
    res.status(204).end();
  });

  // GET /api/auth/me → 200 { user } | 401 unauthenticated.
  router.get('/me', sessionMiddleware(db), (req, res) => {
    res.json({ user: userFromRow(req.user) });
  });

  return router;
}

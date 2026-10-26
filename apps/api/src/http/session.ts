import type { CookieOptions, NextFunction, Request, Response } from 'express';
import type { DB } from '../db/index.js';
import { SESSION_TTL_MS, touchSession, type UserRow } from '../db/users.js';

declare global {
  namespace Express {
    interface Request {
      /** Set by `sessionMiddleware`: the signed-in user's id, which scopes all data. */
      clientId: string;
      user: UserRow;
    }
  }
}

export const SESSION_COOKIE = 'pulsar_session';

/**
 * HttpOnly, long-lived, first-party cookie. Secure only over HTTPS — the app is
 * normally served over plain HTTP inside a Tailscale network.
 */
function cookieOptions(req: Request): CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: req.secure,
    path: '/api',
    maxAge: SESSION_TTL_MS,
  };
}

export function setSessionCookie(req: Request, res: Response, token: string): void {
  res.cookie(SESSION_COOKIE, token, cookieOptions(req));
}

export function clearSessionCookie(req: Request, res: Response): void {
  const { maxAge: _maxAge, ...opts } = cookieOptions(req);
  res.clearCookie(SESSION_COOKIE, opts);
}

/** Minimal Cookie header parser (no cookie-parser dependency). */
export function readSessionToken(req: Request): string | undefined {
  const header = req.get('cookie');
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() === SESSION_COOKIE) {
      const value = part.slice(eq + 1).trim();
      try {
        return decodeURIComponent(value) || undefined;
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}

/** Every data route requires a valid session cookie → 401 `unauthenticated`. */
export function sessionMiddleware(db: DB) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const token = readSessionToken(req);
    const session = token ? touchSession(db, token) : undefined;
    if (!token || !session) {
      if (token) clearSessionCookie(req, res);
      res.status(401).json({ error: 'unauthenticated' });
      return;
    }
    if (session.refreshed) setSessionCookie(req, res, token);
    req.user = session.user;
    req.clientId = session.user.id;
    next();
  };
}

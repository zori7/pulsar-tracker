import { createHash, randomBytes } from 'node:crypto';
import type { User } from '@pulsar/shared';
import type { DB } from './index.js';

export interface UserRow {
  id: string;
  username: string;
  password_hash: string;
  created_at: string;
}

/** Server-side session lifetime; slides forward on use (see touchSession). */
export const SESSION_TTL_MS = 400 * 24 * 60 * 60 * 1000;
/** Don't rewrite the session row more than once a day. */
const SESSION_REFRESH_MS = 24 * 60 * 60 * 1000;

export function userFromRow(row: UserRow): User {
  return { id: row.id, username: row.username };
}

export function getUserByUsername(db: DB, username: string): UserRow | undefined {
  return db.prepare('SELECT * FROM users WHERE username = ?').get(username) as UserRow | undefined;
}

export function getUserById(db: DB, id: string): UserRow | undefined {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined;
}

/** Inserts a user; returns undefined when the username is already taken. */
export function insertUser(
  db: DB,
  user: { id: string; username: string; passwordHash: string },
  now = new Date(),
): UserRow | undefined {
  const result = db
    .prepare(
      `INSERT INTO users (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)
       ON CONFLICT DO NOTHING`,
    )
    .run(user.id, user.username, user.passwordHash, now.toISOString());
  return result.changes === 1 ? getUserById(db, user.id) : undefined;
}

/**
 * A pre-accounts browser id can be adopted as a new user's id (keeping its
 * items/settings) only if it has data and no account owns it yet.
 */
export function canClaimLegacyClientId(db: DB, clientId: string): boolean {
  if (getUserById(db, clientId)) return false;
  const hasData = db
    .prepare(
      `SELECT EXISTS(SELECT 1 FROM items WHERE client_id = ?)
           OR EXISTS(SELECT 1 FROM settings WHERE client_id = ?) AS found`,
    )
    .get(clientId, clientId) as { found: number };
  return hasData.found === 1;
}

/* ------------------------------------------------------------- sessions */

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function createSession(db: DB, userId: string, now = new Date()): string {
  const token = randomBytes(32).toString('base64url');
  db.prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)').run(
    hashToken(token),
    userId,
    now.toISOString(),
    new Date(now.getTime() + SESSION_TTL_MS).toISOString(),
  );
  return token;
}

export interface SessionLookup {
  user: UserRow;
  /** True when the expiry was slid forward (the cookie should be re-issued). */
  refreshed: boolean;
}

/** Resolves a raw token to its user, sliding the expiry; undefined if unknown/expired. */
export function touchSession(db: DB, token: string, now = new Date()): SessionLookup | undefined {
  const tokenHash = hashToken(token);
  const row = db
    .prepare(
      `SELECT s.expires_at, u.* FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ?`,
    )
    .get(tokenHash) as (UserRow & { expires_at: string }) | undefined;
  if (!row) return undefined;

  const expiresAt = Date.parse(row.expires_at);
  if (expiresAt <= now.getTime()) {
    deleteSession(db, token);
    return undefined;
  }

  const { expires_at: _expires, ...user } = row;
  const refreshed = expiresAt - now.getTime() < SESSION_TTL_MS - SESSION_REFRESH_MS;
  if (refreshed) {
    db.prepare('UPDATE sessions SET expires_at = ? WHERE token_hash = ?').run(
      new Date(now.getTime() + SESSION_TTL_MS).toISOString(),
      tokenHash,
    );
  }
  return { user, refreshed };
}

export function deleteSession(db: DB, token: string): void {
  db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(token));
}

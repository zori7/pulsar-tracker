import type { Settings } from '@pulsar/shared';
import type { DB } from './index.js';

export interface SettingsRow {
  client_id: string;
  ntfy_topic: string;
  ntfy_server: string;
  notifications_enabled: number;
  digest_time: string;
  updated_at: string;
}

export interface SettingsDefaults {
  topic: string;
  server: string;
  digestTime: string;
}

export function settingsFromRow(row: SettingsRow): Settings {
  return {
    clientId: row.client_id,
    ntfyTopic: row.ntfy_topic,
    ntfyServer: row.ntfy_server,
    notificationsEnabled: row.notifications_enabled === 1,
    digestTime: row.digest_time,
  };
}

export function getSettingsRow(db: DB, clientId: string): SettingsRow | undefined {
  return db.prepare('SELECT * FROM settings WHERE client_id = ?').get(clientId) as SettingsRow | undefined;
}

/** Auto-provisions the row with defaults on first use (idempotent). */
export function ensureSettingsRow(db: DB, clientId: string, defaults: SettingsDefaults, now = new Date()): SettingsRow {
  db.prepare(
    `INSERT INTO settings (client_id, ntfy_topic, ntfy_server, notifications_enabled, digest_time, updated_at)
     VALUES (?, ?, ?, 1, ?, ?)
     ON CONFLICT(client_id) DO NOTHING`,
  ).run(clientId, defaults.topic, defaults.server, defaults.digestTime, now.toISOString());
  return getSettingsRow(db, clientId) as SettingsRow;
}

export interface SettingsPatch {
  ntfyTopic?: string;
  ntfyServer?: string;
  notificationsEnabled?: boolean;
  digestTime?: string;
}

export function updateSettingsRow(
  db: DB,
  clientId: string,
  patch: SettingsPatch,
  updatedAt = new Date().toISOString(),
): SettingsRow {
  const sets: string[] = [];
  const values: unknown[] = [];
  if (patch.ntfyTopic !== undefined) {
    sets.push('ntfy_topic = ?');
    values.push(patch.ntfyTopic);
  }
  if (patch.ntfyServer !== undefined) {
    sets.push('ntfy_server = ?');
    values.push(patch.ntfyServer.trim().replace(/\/+$/, ''));
  }
  if (patch.notificationsEnabled !== undefined) {
    sets.push('notifications_enabled = ?');
    values.push(patch.notificationsEnabled ? 1 : 0);
  }
  if (patch.digestTime !== undefined) {
    sets.push('digest_time = ?');
    values.push(patch.digestTime);
  }
  if (sets.length > 0) {
    sets.push('updated_at = ?');
    values.push(updatedAt, clientId);
    db.prepare(`UPDATE settings SET ${sets.join(', ')} WHERE client_id = ?`).run(...values);
  }
  return getSettingsRow(db, clientId) as SettingsRow;
}

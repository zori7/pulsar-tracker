import type { ISODate } from '@pulsar/shared';

/** Per-item reminder — SPEC §5: "⏰ <title> is due today" (+ optional description). */
export function itemReminderMessage(
  title: string,
  description: string | null,
): { title: string; message: string } {
  const body = `⏰ ${title} is due today`;
  return { title, message: description ? `${body}\n${description}` : body };
}

export type DigestEntryStatus = 'done' | 'skipped' | 'pending';

/**
 * Daily digest — SPEC §5: one line per due item. ☑ done, ⊘ skipped (acknowledged),
 * ☐ still to do.
 */
export function digestMessage(
  date: ISODate,
  entries: ReadonlyArray<{ title: string; status: DigestEntryStatus }>,
): { title: string; message: string } {
  const marker: Record<DigestEntryStatus, string> = { done: '☑', skipped: '⊘', pending: '☐' };
  const lines = entries.map((entry) => `${marker[entry.status]} ${entry.title}`);
  return { title: `Pulsar digest · ${date}`, message: lines.join('\n') };
}

/** POST /api/notifications/test. */
/**
 * Absolute deep link into the web app for a notification's ntfy `Click` action.
 * Returns undefined when no app base URL is configured (APP_URL unset) — the
 * message is then sent without a click action.
 */
export function clickUrl(appUrl: string, path: string): string | undefined {
  if (!appUrl) return undefined;
  return `${appUrl.replace(/\/+$/, '')}${path}`;
}

export function testMessage(): { title: string; message: string } {
  return { title: 'Pulsar Tracker', message: 'Test notification from Pulsar Tracker' };
}

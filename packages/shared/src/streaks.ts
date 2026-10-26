import { addDays, fromDayNumber, toDayNumber, todayISO } from './dates.js';
import { isDue } from './schedule.js';
import type { CompletionMap, CompletionStatus, ISODate, Schedule } from './types.js';

const DEFAULT_LOOKBACK = 730;

/**
 * Consecutive due days marked `done`, counting back from `today`.
 * - `skipped` days are neutral (no count, no break).
 * - A past due day with no completion breaks the streak.
 * - `today`, when due and unmarked, is pending: it neither counts nor breaks.
 */
export function currentStreak(
  schedule: Schedule,
  completions: CompletionMap,
  today: ISODate = todayISO(),
  lookbackDays = DEFAULT_LOOKBACK,
): number {
  let streak = 0;
  const start = toDayNumber(today) - lookbackDays;
  for (let dn = toDayNumber(today); dn > start; dn--) {
    const date = fromDayNumber(dn);
    if (!isDue(schedule, date)) continue;
    const status = completions[date];
    if (status === 'done') {
      streak++;
      continue;
    }
    if (status === 'skipped') continue;
    if (date === today) continue; // still pending
    break; // missed a due day
  }
  return streak;
}

/** Longest run of `done` due days within the lookback window. */
export function bestStreak(
  schedule: Schedule,
  completions: CompletionMap,
  today: ISODate = todayISO(),
  lookbackDays = DEFAULT_LOOKBACK,
): number {
  let best = 0;
  let run = 0;
  const start = toDayNumber(today) - lookbackDays;
  for (let dn = start; dn <= toDayNumber(today); dn++) {
    const date = fromDayNumber(dn);
    if (!isDue(schedule, date)) continue;
    const status = completions[date];
    if (status === 'done') {
      run++;
      if (run > best) best = run;
    } else if (status !== 'skipped') {
      run = 0;
    }
  }
  return best;
}

export function statusOn(completions: CompletionMap, date: ISODate): CompletionStatus | null {
  return completions[date] ?? null;
}

export function isDoneOn(completions: CompletionMap, date: ISODate): boolean {
  return completions[date] === 'done';
}

/** Completion rate over the last `days` due days (0..1). `null` when no due days. */
export function completionRate(
  schedule: Schedule,
  completions: CompletionMap,
  today: ISODate = todayISO(),
  days = 30,
): number | null {
  let due = 0;
  let done = 0;
  const start = toDayNumber(today) - days + 1;
  for (let dn = start; dn <= toDayNumber(today); dn++) {
    const date = fromDayNumber(dn);
    if (!isDue(schedule, date)) continue;
    due++;
    if (completions[date] === 'done') done++;
  }
  return due === 0 ? null : done / due;
}

/** Convert an item's completion list into a lookup map. */
export function toCompletionMap(
  itemId: string,
  completions: Iterable<{ itemId: string; date: ISODate; status: CompletionStatus }>,
): CompletionMap {
  const map: Record<ISODate, CompletionStatus> = {};
  for (const c of completions) {
    if (c.itemId === itemId) map[c.date] = c.status;
  }
  return map;
}

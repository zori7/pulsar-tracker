import type { Completion, CompletionStatus, Item, ISODate } from '@pulsar/shared';
import { isDue, toCompletionMap, addDays, todayISO } from '@pulsar/shared';

export interface MissedOccurrence {
  date: ISODate;
  item: Item;
}

/**
 * Past due occurrences in the last `windowDays` days that have no completion
 * at all (neither done nor skipped), newest first. Drives the missed banner
 * and the Backfill sheet (SPEC §6).
 */
export function findMissed(
  items: Item[],
  completions: readonly Completion[],
  today: ISODate = todayISO(),
  windowDays = 14,
): MissedOccurrence[] {
  const maps = new Map<string, Record<ISODate, CompletionStatus>>();
  for (const item of items) {
    maps.set(item.id, toCompletionMap(item.id, completions));
  }
  const active = items.filter((i) => !i.archived);
  const out: MissedOccurrence[] = [];
  for (let back = 1; back <= windowDays; back++) {
    const date = addDays(today, -back);
    for (const item of active) {
      if (!isDue(item.schedule, date)) continue;
      if (maps.get(item.id)?.[date]) continue;
      out.push({ date, item });
    }
  }
  return out;
}

export type OccurrenceKind = 'missed' | 'done' | 'skipped' | 'pending';

export function statusKind(
  status: CompletionStatus | null | undefined,
  date: ISODate,
  today: ISODate,
): OccurrenceKind {
  if (status === 'done') return 'done';
  if (status === 'skipped') return 'skipped';
  if (date < today) return 'missed';
  return 'pending';
}

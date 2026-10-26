import {
  addDays,
  dayOfMonth,
  diffDays,
  formatDate,
  isISODate,
  toDayNumber,
  fromDayNumber,
  weekdayOf,
} from './dates.js';
import type { ISODate, ItemKind, Schedule, ScheduleType, Weekday } from './types.js';

export const SCHEDULE_TYPES: ScheduleType[] = [
  'once',
  'weekdays',
  'monthdays',
  'interval',
  'cycle',
];

export const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'] as const;
export const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
export const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

/** Is `date` an active/due day for this schedule? Pure and timezone-free. */
export function isDue(schedule: Schedule, date: ISODate): boolean {
  switch (schedule.type) {
    case 'once':
      return schedule.date === date;
    case 'weekdays':
      return schedule.weekdays.includes(weekdayOf(date));
    case 'monthdays':
      return schedule.monthdays.includes(dayOfMonth(date));
    case 'interval': {
      const delta = diffDays(date, schedule.anchor);
      return delta >= 0 && delta % schedule.every === 0;
    }
    case 'cycle': {
      const delta = diffDays(date, schedule.anchor);
      if (delta < 0) return false;
      return schedule.pattern[delta % schedule.length] === true;
    }
  }
}

/** All due dates in [from, to], ascending. `limit` guards pathological ranges. */
export function dueDatesBetween(
  schedule: Schedule,
  from: ISODate,
  to: ISODate,
  limit = 800,
): ISODate[] {
  const out: ISODate[] = [];
  const end = toDayNumber(to);
  let dn = toDayNumber(from);
  if (end - dn > limit) dn = end - limit;
  for (; dn <= end && out.length < limit; dn++) {
    const date = fromDayNumber(dn);
    if (isDue(schedule, date)) out.push(date);
  }
  return out;
}

/** First due date strictly after `after`, searching at most `horizonDays`. */
export function nextDueDate(schedule: Schedule, after: ISODate, horizonDays = 800): ISODate | null {
  const end = toDayNumber(after) + horizonDays;
  for (let dn = toDayNumber(after) + 1; dn <= end; dn++) {
    const date = fromDayNumber(dn);
    if (isDue(schedule, date)) return date;
  }
  return null;
}

/** The next `count` due dates starting at `from` (inclusive when due). */
export function nextOccurrences(
  schedule: Schedule,
  from: ISODate,
  count: number,
  horizonDays = 800,
): ISODate[] {
  const out: ISODate[] = [];
  const end = toDayNumber(from) + horizonDays;
  for (let dn = toDayNumber(from); dn <= end && out.length < count; dn++) {
    const date = fromDayNumber(dn);
    if (isDue(schedule, date)) out.push(date);
  }
  return out;
}

export function activeDaysInCycle(pattern: boolean[]): number {
  return pattern.filter(Boolean).length;
}

/** Human summary, e.g. 'Mon, Wed, Fri' or '2 days on, 3 days rest · 5-day loop'. */
export function describeSchedule(schedule: Schedule, locale = 'en-US'): string {
  switch (schedule.type) {
    case 'once':
      return `One-time · ${formatDate(schedule.date, locale)}`;
    case 'weekdays': {
      const days = [...schedule.weekdays].sort((a, b) => a - b);
      if (days.length === 7) return 'Every day';
      return days.map((d) => WEEKDAY_SHORT[d]).join(', ');
    }
    case 'monthdays': {
      const days = [...schedule.monthdays].sort((a, b) => a - b);
      return `On the ${days.map(ordinal).join(', ')} of each month`;
    }
    case 'interval':
      return schedule.every === 1 ? 'Every day' : `Every ${schedule.every} days`;
    case 'cycle': {
      const { length, pattern } = schedule;
      const active = activeDaysInCycle(pattern);
      if (active === length) return 'Every day';
      if (active === 0) return `Empty loop · ${length}-day cycle`;
      const runs = describeRuns(pattern);
      return `${runs} · ${length}-day loop`;
    }
  }
}

/** Compress a pattern into '2 days on, 3 days rest' style prose. */
function describeRuns(pattern: boolean[]): string {
  const parts: string[] = [];
  let i = 0;
  while (i < pattern.length) {
    const state = pattern[i] === true;
    let len = 1;
    while (i + len < pattern.length && (pattern[i + len] === true) === state) len++;
    parts.push(state ? `${len} ${pluralDays(len)} on` : `${len} ${pluralDays(len)} rest`);
    i += len;
  }
  return parts.join(', ');
}

function pluralDays(n: number): string {
  return n === 1 ? 'day' : 'days';
}

function ordinal(n: number): string {
  const suffix =
    n % 100 >= 11 && n % 100 <= 13
      ? 'th'
      : n % 10 === 1
        ? 'st'
        : n % 10 === 2
          ? 'nd'
          : n % 10 === 3
            ? 'rd'
            : 'th';
  return `${n}${suffix}`;
}

/** Structural + semantic validation. Returns error strings (empty = valid). */
export function validateSchedule(schedule: unknown, kind?: ItemKind): string[] {
  const errors: string[] = [];
  const s = schedule as Partial<Schedule> | null;
  if (!s || typeof s !== 'object' || typeof s.type !== 'string') {
    return ['schedule must be an object with a type'];
  }
  if (kind === 'todo' && s.type !== 'once') {
    errors.push('todos must use a one-time schedule');
  }
  switch (s.type) {
    case 'once': {
      const once = s as { date?: unknown };
      if (!isISODate(once.date)) errors.push('once.date must be YYYY-MM-DD');
      break;
    }
    case 'weekdays': {
      const w = s as { weekdays?: unknown };
      if (!Array.isArray(w.weekdays) || w.weekdays.length === 0) {
        errors.push('weekdays must be a non-empty array');
      } else if (
        !w.weekdays.every((d) => Number.isInteger(d) && (d as number) >= 0 && (d as number) <= 6)
      ) {
        errors.push('weekdays must be integers 0..6 (0 = Sunday)');
      }
      break;
    }
    case 'monthdays': {
      const m = s as { monthdays?: unknown };
      if (!Array.isArray(m.monthdays) || m.monthdays.length === 0) {
        errors.push('monthdays must be a non-empty array');
      } else if (
        !m.monthdays.every((d) => Number.isInteger(d) && (d as number) >= 1 && (d as number) <= 31)
      ) {
        errors.push('monthdays must be integers 1..31');
      }
      break;
    }
    case 'interval': {
      const iv = s as { every?: unknown; anchor?: unknown };
      if (!Number.isInteger(iv.every) || (iv.every as number) < 1) {
        errors.push('interval.every must be an integer >= 1');
      }
      if (!isISODate(iv.anchor)) errors.push('interval.anchor must be YYYY-MM-DD');
      break;
    }
    case 'cycle': {
      const c = s as { length?: unknown; pattern?: unknown; anchor?: unknown };
      if (!Number.isInteger(c.length) || (c.length as number) < 1 || (c.length as number) > 31) {
        errors.push('cycle.length must be an integer 1..31');
      }
      if (!Array.isArray(c.pattern)) {
        errors.push('cycle.pattern must be an array of booleans');
      } else {
        if (c.pattern.length !== c.length) {
          errors.push('cycle.pattern length must equal cycle.length');
        }
        if (!c.pattern.every((p) => typeof p === 'boolean')) {
          errors.push('cycle.pattern must contain only booleans');
        }
        if (!c.pattern.some(Boolean)) {
          errors.push('cycle.pattern must have at least one active day');
        }
      }
      if (!isISODate(c.anchor)) errors.push('cycle.anchor must be YYYY-MM-DD');
      break;
    }
    default:
      errors.push(`unknown schedule type '${String((s as { type?: unknown }).type)}'`);
  }
  return errors;
}

export function isValidHHMM(value: unknown): boolean {
  return typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

/** Sensible starting schedule when the user picks a type in the editor. */
export function createDefaultSchedule(type: ScheduleType, today: ISODate): Schedule {
  switch (type) {
    case 'once':
      return { type: 'once', date: today };
    case 'weekdays':
      return { type: 'weekdays', weekdays: [weekdayOf(today)] };
    case 'monthdays':
      return { type: 'monthdays', monthdays: [dayOfMonth(today)] };
    case 'interval':
      return { type: 'interval', every: 2, anchor: today };
    case 'cycle':
      return { type: 'cycle', length: 5, pattern: [true, true, false, false, false], anchor: today };
  }
}

/** N-on / M-off preset used by the loop editor. */
export function createCyclePreset(on: number, off: number, anchor: ISODate): Schedule {
  const length = on + off;
  return {
    type: 'cycle',
    length,
    pattern: Array.from({ length }, (_, i) => i < on),
    anchor,
  };
}

/** Anchor-relative index of a date in a cycle (null when before the anchor). */
export function cycleIndex(schedule: { length: number; anchor: ISODate }, date: ISODate): number | null {
  const delta = diffDays(date, schedule.anchor);
  return delta < 0 ? null : delta % schedule.length;
}

/** Shift a cycle anchor so the pattern keeps its phase (used when editing). */
export function reanchorCycle(schedule: { length: number; pattern: boolean[]; anchor: ISODate }, newAnchor: ISODate): {
  anchor: ISODate;
  pattern: boolean[];
} {
  const shift = ((diffDays(newAnchor, schedule.anchor) % schedule.length) + schedule.length) % schedule.length;
  const pattern = schedule.pattern.slice(shift).concat(schedule.pattern.slice(0, shift));
  return { anchor: newAnchor, pattern };
}

/** Dates for the week (Sun..Sat) containing `date`. */
export function weekOf(date: ISODate): ISODate[] {
  const sunday = addDays(date, -weekdayOf(date));
  return Array.from({ length: 7 }, (_, i) => addDays(sunday, i));
}

export function monthGrid(year: number, month: number): ISODate[] {
  const first: ISODate = `${year}-${String(month).padStart(2, '0')}-01`;
  const start = addDays(first, -weekdayOf(first));
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const last: ISODate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  const total = diffDays(last, start) + 1;
  const cells = Math.ceil(total / 7) * 7;
  return Array.from({ length: cells }, (_, i) => addDays(start, i));
}

import type { HHMM, ISODate, Weekday } from './types.js';

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** Days since 1970-01-01 for a calendar date. DST-free (UTC midnight math). */
export function toDayNumber(date: ISODate): number {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return Math.floor(Date.UTC(y, m - 1, d) / 86400000);
}

export function fromDayNumber(dayNumber: number): ISODate {
  const dt = new Date(dayNumber * 86400000);
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

export function isISODate(value: unknown): value is ISODate {
  if (typeof value !== 'string' || !ISO_RE.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number) as [number, number, number];
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dn = Math.floor(Date.UTC(y, m - 1, d) / 86400000);
  const dt = new Date(dn * 86400000);
  return dt.getUTCFullYear() === y && dt.getUTCMonth() + 1 === m && dt.getUTCDate() === d;
}

export function addDays(date: ISODate, days: number): ISODate {
  return fromDayNumber(toDayNumber(date) + days);
}

/** `a - b` in whole days. */
export function diffDays(a: ISODate, b: ISODate): number {
  return toDayNumber(a) - toDayNumber(b);
}

/** 0 = Sunday … 6 = Saturday. */
export function weekdayOf(date: ISODate): Weekday {
  return (((toDayNumber(date) % 7) + 4) % 7) as Weekday;
}

/** Month is 1-based. */
export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function dayOfMonth(date: ISODate): number {
  return Number(date.slice(8, 10));
}

export function monthOf(date: ISODate): number {
  return Number(date.slice(5, 7));
}

export function yearOf(date: ISODate): number {
  return Number(date.slice(0, 4));
}

/** Today in the local timezone of the running JS environment. */
export function todayISO(now: Date = new Date()): ISODate {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** Current local wall-clock 'HH:MM'. */
export function nowHHMM(now: Date = new Date()): HHMM {
  return `${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

export function isBefore(a: ISODate, b: ISODate): boolean {
  return toDayNumber(a) < toDayNumber(b);
}

export function isAfter(a: ISODate, b: ISODate): boolean {
  return toDayNumber(a) > toDayNumber(b);
}

export function maxDate(a: ISODate, b: ISODate): ISODate {
  return isAfter(a, b) ? a : b;
}

export function minDate(a: ISODate, b: ISODate): ISODate {
  return isBefore(a, b) ? a : b;
}

/** '2026-03-03' → 'Mar 3, 2026' (stable, en-US). */
export function formatDate(date: ISODate, locale = 'en-US'): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

export function formatDayMonth(date: ISODate, locale = 'en-US'): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

import { addDays, formatDayMonth, todayISO, type ISODate, weekdayOf } from '@pulsar/shared';

export { addDays, todayISO, weekdayOf };
export type { ISODate };

const WEEKDAY_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const WEEKDAY_NARROW = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** 'Oct 24' — month + day, no year, no weekday. UTC-safe. */
export function fmtMonthDay(date: ISODate): string {
  return formatDayMonth(date).replace(/^\w{3}, /, '');
}

/** 'Fri, Oct 24' — short weekday + date. */
export function fmtWeekdayDate(date: ISODate): string {
  return formatDayMonth(date);
}

/** 'Friday' — long weekday name (header day word). */
export function fmtWeekdayLong(date: ISODate): string {
  return WEEKDAY_LONG[weekdayOf(date)] ?? '';
}

/** 'October 2026' for calendar headers. */
export function fmtMonthYear(year: number, month: number): string {
  return `${MONTHS[month - 1]} ${year}`;
}

export function weekdayLetter(date: ISODate): string {
  return WEEKDAY_NARROW[weekdayOf(date)] ?? '';
}

export function dayNumber(date: ISODate): number {
  return Number(date.slice(8, 10));
}

export function monthOf(date: ISODate): number {
  return Number(date.slice(5, 7));
}

export function yearOf(date: ISODate): number {
  return Number(date.slice(0, 4));
}

/** Shift a 'YYYY-MM' month by n months. */
export function shiftMonth(year: number, month: number, delta: number): [number, number] {
  const total = year * 12 + (month - 1) + delta;
  return [Math.floor(total / 12), (total % 12) + 1];
}

export function isSameMonth(date: ISODate, year: number, month: number): boolean {
  return yearOf(date) === year && monthOf(date) === month;
}

export function clampDate(date: ISODate, min: ISODate, max: ISODate): ISODate {
  if (date < min) return min;
  if (date > max) return max;
  return date;
}

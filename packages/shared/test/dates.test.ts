import { describe, expect, it } from 'vitest';
import {
  addDays,
  dayOfMonth,
  daysInMonth,
  diffDays,
  fromDayNumber,
  isISODate,
  todayISO,
  toDayNumber,
  weekdayOf,
} from '../src/dates.js';
import { weekOf } from '../src/schedule.js';

describe('dates', () => {
  it('round-trips day numbers', () => {
    expect(toDayNumber('1970-01-01')).toBe(0);
    expect(fromDayNumber(0)).toBe('1970-01-01');
    expect(fromDayNumber(toDayNumber('2026-10-24'))).toBe('2026-10-24');
  });

  it('adds days across month and leap boundaries', () => {
    expect(addDays('2026-02-27', 2)).toBe('2026-03-01');
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('diffs days', () => {
    expect(diffDays('2026-03-01', '2026-02-27')).toBe(2);
    expect(diffDays('2024-02-29', '2024-03-01')).toBe(-1);
  });

  it('knows weekdays (0 = Sunday)', () => {
    expect(weekdayOf('1970-01-01')).toBe(4); // Thursday
    expect(weekdayOf('2000-01-01')).toBe(6); // Saturday
    expect(weekdayOf('2026-10-24')).toBe(6); // Saturday
    expect(weekdayOf('2026-02-01')).toBe(0); // Sunday
    expect(weekdayOf('2026-10-26')).toBe(1); // Monday
  });

  it('validates ISO dates', () => {
    expect(isISODate('2026-10-24')).toBe(true);
    expect(isISODate('2024-02-29')).toBe(true);
    expect(isISODate('2026-02-29')).toBe(false);
    expect(isISODate('2026-02-30')).toBe(false);
    expect(isISODate('2026-13-01')).toBe(false);
    expect(isISODate('24-10-2026')).toBe(false);
    expect(isISODate(20261024)).toBe(false);
  });

  it('counts days in month', () => {
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2026, 12)).toBe(31);
  });

  it('extracts day/month parts', () => {
    expect(dayOfMonth('2026-10-24')).toBe(24);
    expect(weekOf('2026-10-24')).toEqual([
      '2026-10-18',
      '2026-10-19',
      '2026-10-20',
      '2026-10-21',
      '2026-10-22',
      '2026-10-23',
      '2026-10-24',
    ]);
  });

  it('uses local timezone for todayISO', () => {
    expect(todayISO(new Date(2026, 9, 24, 23, 59))).toBe('2026-10-24');
    expect(todayISO(new Date(2026, 9, 25, 0, 1))).toBe('2026-10-25');
  });
});

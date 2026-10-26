import { describe, expect, it } from 'vitest';
import {
  createCyclePreset,
  createDefaultSchedule,
  describeSchedule,
  dueDatesBetween,
  isDue,
  monthGrid,
  nextDueDate,
  nextOccurrences,
  validateSchedule,
} from '../src/schedule.js';
import type { Schedule } from '../src/types.js';

const once: Schedule = { type: 'once', date: '2026-10-24' };
const weekdays: Schedule = { type: 'weekdays', weekdays: [1, 3, 5] };
const monthdays: Schedule = { type: 'monthdays', monthdays: [1, 15, 31] };
const interval: Schedule = { type: 'interval', every: 3, anchor: '2026-10-24' };
const cycle: Schedule = {
  type: 'cycle',
  length: 5,
  pattern: [true, true, false, false, false],
  anchor: '2026-10-24',
};

describe('isDue', () => {
  it('once', () => {
    expect(isDue(once, '2026-10-24')).toBe(true);
    expect(isDue(once, '2026-10-25')).toBe(false);
    expect(isDue(once, '2026-10-23')).toBe(false);
  });

  it('weekdays (0 = Sunday)', () => {
    expect(isDue(weekdays, '2026-10-26')).toBe(true); // Mon
    expect(isDue(weekdays, '2026-10-28')).toBe(true); // Wed
    expect(isDue(weekdays, '2026-10-30')).toBe(true); // Fri
    expect(isDue(weekdays, '2026-10-25')).toBe(false); // Sun
    expect(isDue(weekdays, '2026-10-27')).toBe(false); // Tue
  });

  it('monthdays skips days a month does not have', () => {
    expect(isDue(monthdays, '2026-01-31')).toBe(true);
    expect(isDue(monthdays, '2026-02-28')).toBe(false);
    expect(isDue(monthdays, '2026-03-31')).toBe(true);
    expect(isDue(monthdays, '2026-10-15')).toBe(true);
    expect(isDue(monthdays, '2026-10-16')).toBe(false);
  });

  it('interval is anchor-relative', () => {
    expect(isDue(interval, '2026-10-24')).toBe(true); // anchor
    expect(isDue(interval, '2026-10-27')).toBe(true);
    expect(isDue(interval, '2026-10-30')).toBe(true);
    expect(isDue(interval, '2026-10-25')).toBe(false);
    expect(isDue(interval, '2026-10-21')).toBe(false); // before anchor
  });

  it('cycle follows the pattern loop and respects the anchor', () => {
    expect(isDue(cycle, '2026-10-24')).toBe(true);
    expect(isDue(cycle, '2026-10-25')).toBe(true);
    expect(isDue(cycle, '2026-10-26')).toBe(false);
    expect(isDue(cycle, '2026-10-28')).toBe(false);
    expect(isDue(cycle, '2026-10-29')).toBe(true); // next loop
    expect(isDue(cycle, '2026-10-30')).toBe(true);
    expect(isDue(cycle, '2026-10-23')).toBe(false); // before anchor
  });
});

describe('ranges', () => {
  it('lists due dates in a window', () => {
    expect(dueDatesBetween(interval, '2026-10-24', '2026-11-02')).toEqual([
      '2026-10-24',
      '2026-10-27',
      '2026-10-30',
      '2026-11-02',
    ]);
  });

  it('finds the next due date', () => {
    expect(nextDueDate(cycle, '2026-10-25')).toBe('2026-10-29');
    expect(nextDueDate(once, '2026-10-25')).toBe(null);
  });

  it('lists the next occurrences', () => {
    expect(nextOccurrences(weekdays, '2026-10-26', 3)).toEqual([
      '2026-10-26',
      '2026-10-28',
      '2026-10-30',
    ]);
  });

  it('builds month grids aligned to weeks', () => {
    const grid = monthGrid(2026, 2); // Feb 2026 starts on Sunday, 28 days
    expect(grid.length).toBe(28);
    expect(grid[0]).toBe('2026-02-01');
    expect(grid[grid.length - 1]).toBe('2026-02-28');
    const march = monthGrid(2026, 3);
    expect(march.length % 7).toBe(0);
    expect(march[0]).toBe('2026-03-01'); // Sunday
  });
});

describe('describeSchedule', () => {
  it('describes every type', () => {
    expect(describeSchedule({ type: 'weekdays', weekdays: [0, 1, 2, 3, 4, 5, 6] })).toBe('Every day');
    expect(describeSchedule({ type: 'weekdays', weekdays: [1, 3, 5] })).toBe('Mon, Wed, Fri');
    expect(describeSchedule({ type: 'interval', every: 3, anchor: '2026-10-24' })).toBe('Every 3 days');
    expect(describeSchedule({ type: 'interval', every: 1, anchor: '2026-10-24' })).toBe('Every day');
    expect(describeSchedule(cycle)).toBe('2 days on, 3 days rest · 5-day loop');
    expect(describeSchedule({ type: 'monthdays', monthdays: [1, 2, 3, 11, 21, 31] })).toBe(
      'On the 1st, 2nd, 3rd, 11th, 21st, 31st of each month',
    );
  });
});

describe('validateSchedule', () => {
  it('accepts valid schedules', () => {
    expect(validateSchedule(once, 'todo')).toEqual([]);
    expect(validateSchedule(weekdays, 'habit')).toEqual([]);
    expect(validateSchedule(monthdays, 'habit')).toEqual([]);
    expect(validateSchedule(interval, 'habit')).toEqual([]);
    expect(validateSchedule(cycle, 'habit')).toEqual([]);
  });

  it('rejects invalid schedules', () => {
    expect(validateSchedule({ type: 'weekdays', weekdays: [1, 3, 5] }, 'todo').length).toBeGreaterThan(0);
    expect(validateSchedule({ type: 'weekdays', weekdays: [] })).toContain(
      'weekdays must be a non-empty array',
    );
    expect(validateSchedule({ type: 'monthdays', monthdays: [0] })).toContain(
      'monthdays must be integers 1..31',
    );
    expect(validateSchedule({ type: 'interval', every: 0, anchor: '2026-10-24' })).toContain(
      'interval.every must be an integer >= 1',
    );
    expect(validateSchedule({ type: 'cycle', length: 5, pattern: [true], anchor: '2026-10-24' })).toContain(
      'cycle.pattern length must equal cycle.length',
    );
    expect(
      validateSchedule({ type: 'cycle', length: 3, pattern: [false, false, false], anchor: '2026-10-24' }),
    ).toContain('cycle.pattern must have at least one active day');
    expect(validateSchedule({ type: 'once', date: 'soon' })).toContain('once.date must be YYYY-MM-DD');
    expect(validateSchedule(null)).toEqual(['schedule must be an object with a type']);
  });
});

describe('factory helpers', () => {
  it('creates defaults and presets', () => {
    expect(createDefaultSchedule('once', '2026-10-24')).toEqual({ type: 'once', date: '2026-10-24' });
    expect(createCyclePreset(2, 3, '2026-10-24')).toEqual({
      type: 'cycle',
      length: 5,
      pattern: [true, true, false, false, false],
      anchor: '2026-10-24',
    });
    const def = createDefaultSchedule('cycle', '2026-10-24');
    expect(validateSchedule(def)).toEqual([]);
  });
});

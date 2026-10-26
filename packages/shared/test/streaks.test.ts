import { describe, expect, it } from 'vitest';
import { bestStreak, completionRate, currentStreak, toCompletionMap } from '../src/streaks.js';
import type { CompletionMap, Schedule } from '../src/types.js';

const weekdays: Schedule = { type: 'weekdays', weekdays: [1, 2, 3, 4, 5] }; // Mon–Fri
const cycle: Schedule = {
  type: 'cycle',
  length: 5,
  pattern: [true, true, false, false, false],
  anchor: '2026-10-24', // Sat
};
const TODAY = '2026-10-26'; // Monday

const done = (...dates: string[]): CompletionMap =>
  Object.fromEntries(dates.map((d) => [d, 'done' as const]));

describe('currentStreak', () => {
  it('counts back over due days and ignores non-due days', () => {
    expect(currentStreak(weekdays, done('2026-10-23', '2026-10-22'), TODAY)).toBe(2);
  });

  it('treats today as pending when unmarked', () => {
    expect(currentStreak(weekdays, done('2026-10-23', '2026-10-22'), TODAY)).toBe(2);
  });

  it('counts today when done', () => {
    expect(currentStreak(weekdays, done('2026-10-26', '2026-10-23', '2026-10-22'), TODAY)).toBe(3);
  });

  it('breaks on a missed past due day', () => {
    // 2026-10-21 (Wed) has no completion
    expect(currentStreak(weekdays, done('2026-10-23', '2026-10-22'), TODAY)).toBe(2);
    expect(currentStreak(weekdays, done('2026-10-26'), TODAY)).toBe(1);
    expect(currentStreak(weekdays, done('2026-10-22'), TODAY)).toBe(0);
  });

  it('treats skipped as neutral', () => {
    const completions: CompletionMap = { '2026-10-23': 'skipped', '2026-10-22': 'done' };
    expect(currentStreak(weekdays, completions, TODAY)).toBe(1);
  });

  it('never breaks on days the schedule is not due', () => {
    // cycle: due 10-24, 10-25, then 10-29, 10-30 …
    expect(currentStreak(cycle, done('2026-10-25', '2026-10-24'), TODAY)).toBe(2);
  });
});

describe('bestStreak', () => {
  it('finds the longest run', () => {
    const completions = done('2026-10-19', '2026-10-20', '2026-10-22', '2026-10-23');
    expect(bestStreak(weekdays, completions, TODAY)).toBe(2);
    expect(bestStreak(weekdays, done('2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22'), TODAY)).toBe(4);
  });
});

describe('completionRate', () => {
  it('rates only due days', () => {
    const completions = done('2026-10-23', '2026-10-22');
    // last 7 days from 2026-10-26 → 10-20..10-26, due days: 20,21,22,23,26 = 5 due, 2 done
    expect(completionRate(weekdays, completions, TODAY, 7)).toBeCloseTo(2 / 5);
  });

  it('returns null when nothing is due', () => {
    expect(completionRate(cycle, {}, '2026-10-27', 2)).toBe(null);
  });
});

describe('toCompletionMap', () => {
  it('filters by item', () => {
    const map = toCompletionMap('a', [
      { itemId: 'a', date: '2026-10-24', status: 'done' },
      { itemId: 'b', date: '2026-10-24', status: 'skipped' },
    ]);
    expect(map).toEqual({ '2026-10-24': 'done' });
  });
});

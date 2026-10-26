import { useEffect, useRef, useState } from 'react';
import type { Completion, Item, ISODate } from '@pulsar/shared';
import { isDue, toCompletionMap } from '@pulsar/shared';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { cn } from '../lib/cn';
import { addDays, dayNumber, weekdayLetter } from '../lib/dates';
import { usePagerSwipe } from '../lib/usePagerSwipe';

interface WeekStripProps {
  week: ISODate[];
  selected: ISODate;
  today: ISODate;
  items: Item[];
  completions: readonly Completion[];
  onSelect: (date: ISODate) => void;
}

/**
 * Sun–Sat strip for the week containing the selected day — and a week pager:
 * swipe left/right to page through weeks (the strip slides like the day
 * content and the calendar months) and tap a day to select it. The shown week
 * follows `selected` whenever the selection leaves the visible week (day
 * swipes / arrows crossing a boundary), sliding in the direction of travel.
 *
 * Dots under each day show its items: teal = done, muted = pending, amber =
 * missed (past).
 */
export function WeekStrip({ week, selected, today, items, completions, onSelect }: WeekStripProps) {
  const reduce = useReducedMotion();
  const [dir, setDir] = useState(1);
  const [shown, setShown] = useState<ISODate[]>(week);

  // Sync the visible week when (and only when) the selection moves outside it.
  // Paging the strip changes `shown` but never `selected`, and must not snap
  // back — so compare against the previous selection instead of the week.
  const prevSelected = useRef(selected);
  useEffect(() => {
    if (selected === prevSelected.current) return;
    prevSelected.current = selected;
    if (!shown.includes(selected)) {
      setDir(selected > (shown[0] ?? selected) ? 1 : -1);
      setShown(week);
    }
  }, [selected, week, shown]);

  function page(delta: number) {
    setDir(delta);
    setShown((w) => w.map((d) => addDays(d, delta * 7)));
  }

  // Week pager: same 20px horizontal dead-zone as the day slider.
  const pager = usePagerSwipe({
    enabled: !reduce,
    distance: 48,
    onPrev: () => page(-1),
    onNext: () => page(1),
  });

  const active = items.filter((i) => !i.archived);
  const maps = new Map<string, Record<ISODate, string>>();
  for (const item of active) {
    maps.set(item.id, toCompletionMap(item.id, completions));
  }

  return (
    <div className="relative" role="group" aria-label="Week">
      <AnimatePresence initial={false} mode="popLayout" custom={dir}>
        <motion.div
          key={shown[0]}
          custom={dir}
          {...pager.dragProps}
          initial={reduce ? { opacity: 0 } : { opacity: 0, x: dir > 0 ? '45%' : '-45%' }}
          animate={{ opacity: 1, x: 0 }}
          /* Function variant → exit direction comes from AnimatePresence's
             live custom (current dir), never the frozen previous one. */
          variants={{ exit: (d: number) => (reduce ? { opacity: 0 } : { opacity: 0, x: d > 0 ? '-45%' : '45%' }) }}
          exit="exit"
          transition={{ duration: reduce ? 0 : 0.28, ease: [0.22, 1, 0.36, 1] }}
          className="flex justify-between gap-1"
        >
          {shown.map((date) => {
            const isSelected = date === selected;
            const isToday = date === today;
            const dueItems = active.filter((i) => isDue(i.schedule, date));
            const statuses = dueItems.map((i) => maps.get(i.id)?.[date]);
            const dots = statuses.slice(0, 4).map((status, idx) => ({
              key: idx,
              cls:
                status === 'done'
                  ? 'bg-accent-2'
                  : status === 'skipped'
                    ? 'bg-transparent'
                    : date < today
                      ? 'bg-warn'
                      : 'bg-muted/60',
            }));
            const more = dueItems.length - 4;

            return (
              <button
                key={date}
                type="button"
                aria-label={date}
                aria-pressed={isSelected}
                onClick={() => onSelect(date)}
                className={cn(
                  'relative flex min-h-[3.75rem] flex-1 flex-col items-center justify-center gap-1 rounded-sq-md border pb-2.5 transition duration-100 active:scale-[0.92]',
                  isSelected
                    ? 'border-accent/60 bg-accent/12'
                    : 'border-transparent hover:bg-surface-2/50 active:bg-surface-2/80',
                )}
              >
                <span className={cn('text-[10px] font-medium', isSelected ? 'text-accent' : 'text-muted')}>
                  {weekdayLetter(date)}
                </span>
                <motion.span
                  animate={reduce || !isSelected ? { scale: 1 } : { scale: [0.9, 1] }}
                  transition={{ type: 'spring', stiffness: 500, damping: 26 }}
                  className={cn(
                    'text-[15px] font-medium tabular-nums',
                    isToday && !isSelected && 'text-accent-2',
                    isSelected ? 'text-text' : date > today ? 'text-muted' : 'text-text/85',
                  )}
                >
                  {dayNumber(date)}
                </motion.span>
                <span className="flex h-1.5 items-center gap-0.5" aria-hidden>
                  {dots.map((d) => (
                    <span key={d.key} className={cn('h-1 w-1 rounded-full', d.cls)} />
                  ))}
                  {more > 0 && <span className="text-[8px] leading-none text-muted">+{more}</span>}
                </span>
                {isToday && (
                  <span
                    className={cn(
                      'absolute bottom-1 h-0.5 w-4 rounded-full',
                      isSelected ? 'bg-accent-2' : 'bg-accent-2/50',
                    )}
                    aria-hidden
                  />
                )}
              </button>
            );
          })}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

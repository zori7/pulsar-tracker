import { useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { isDue, monthGrid, toCompletionMap, todayISO, type ISODate } from '@pulsar/shared';
import { useItemsQuery } from '../lib/queries';
import {
  dayNumber,
  fmtMonthYear,
  fmtWeekdayDate,
  monthOf,
  shiftMonth,
  yearOf,
} from '../lib/dates';
import { cn } from '../lib/cn';
import { DayList } from '../components/DayList';
import { Sheet } from '../components/Sheet';
import { usePagerSwipe } from '../lib/usePagerSwipe';

/** Calendar — month grid with due/completion dots and missed-day warnings. */
export function CalendarPage() {
  const reduce = useReducedMotion();
  const navigate = useNavigate();
  const location = useLocation();
  const today = useMemo(() => todayISO(), []);

  const [cursor, setCursor] = useState<[number, number]>(() => [yearOf(today), monthOf(today)]);
  const [dir, setDir] = useState(1);
  const [selectedDay, setSelectedDay] = useState<ISODate | null>(null);
  const { data } = useItemsQuery();

  // Month pager: same 20px horizontal dead-zone as the day slider.
  const pager = usePagerSwipe({
    enabled: !reduce,
    distance: 64,
    onPrev: () => shift(-1),
    onNext: () => shift(1),
  });

  const items = data?.items ?? [];
  const completions = data?.completions ?? [];
  const active = useMemo(() => items.filter((i) => !i.archived), [items]);
  const maps = useMemo(() => {
    const m = new Map<string, Record<ISODate, string>>();
    for (const item of active) m.set(item.id, toCompletionMap(item.id, completions));
    return m;
  }, [active, completions]);

  const [year, month] = cursor;
  const grid = useMemo(() => monthGrid(year, month), [year, month]);

  function shift(delta: number) {
    setDir(delta);
    setCursor((c) => shiftMonth(c[0], c[1], delta));
  }

  function goToday() {
    const t: [number, number] = [yearOf(today), monthOf(today)];
    setDir(t[0] * 12 + t[1] >= year * 12 + month ? 1 : -1);
    setCursor(t);
  }

  return (
    <div className="relative flex flex-col gap-5 sm:pt-10">
      {/* Month header */}
      <header className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-accent-2">
            Calendar
          </p>
          {/* Keyed in place — no AnimatePresence exit gap — with a reserved
              2-line height so 1- vs 2-row month titles never shift the grid. */}
          <motion.h1
            key={`${year}-${month}`}
            initial={reduce ? false : { opacity: 0, x: dir > 0 ? 28 : -28 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: reduce ? 0 : 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="flex min-h-[2.5em] items-center text-[28px] leading-tight font-medium text-text"
          >
            {fmtMonthYear(year, month)}
          </motion.h1>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {(year !== yearOf(today) || month !== monthOf(today)) && (
            <button
              type="button"
              onClick={goToday}
              className="mr-1 min-h-11 rounded-full border border-surface-2 bg-surface/90 px-3.5 text-[13px] font-medium text-muted shadow-sm transition duration-100 hover:text-text active:scale-[0.96] active:bg-surface-2"
            >
              Today
            </button>
          )}
          <button
            type="button"
            onClick={() => shift(-1)}
            aria-label="Previous month"
            className="flex h-11 w-11 items-center justify-center rounded-full border border-surface-2 bg-surface/90 text-muted shadow-sm transition duration-100 hover:text-text active:scale-90 active:bg-surface-2"
          >
            <ChevronLeft size={20} strokeWidth={1.75} />
          </button>
          <button
            type="button"
            onClick={() => shift(1)}
            aria-label="Next month"
            className="flex h-11 w-11 items-center justify-center rounded-full border border-surface-2 bg-surface/90 text-muted shadow-sm transition duration-100 hover:text-text active:scale-90 active:bg-surface-2"
          >
            <ChevronRight size={20} strokeWidth={1.75} />
          </button>
        </div>
      </header>

      {/* Swipeable grid — the month slides in from the side you're navigating
          toward (cross-transition: both months visible mid-turn). */}
      <AnimatePresence initial={false} mode="popLayout" custom={dir}>
        <motion.div
          key={`${year}-${month}`}
          custom={dir}
          {...pager.dragProps}
          onDoubleClick={goToday}
          initial={reduce ? { opacity: 0 } : { opacity: 0, x: dir > 0 ? '35%' : '-35%' }}
          animate={{ opacity: 1, x: 0 }}
          /* Function variant → resolves with AnimatePresence's live custom
             (current dir), so the old month exits toward where you're going,
             not where it last rendered. */
          variants={{ exit: (d: number) => (reduce ? { opacity: 0 } : { opacity: 0, x: d > 0 ? '-35%' : '35%' }) }}
          exit="exit"
          transition={{ duration: reduce ? 0 : 0.3, ease: [0.22, 1, 0.36, 1] }}
          className="select-none rounded-sq-lg border border-surface-2 bg-surface/60 p-2 sm:p-3"
        >
        <div className="mb-1 grid grid-cols-7">
          {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
            <span key={i} className="text-center text-[10px] font-medium text-muted">
              {d}
            </span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {grid.map((date) => {
            const inMonth = monthOf(date) === month && yearOf(date) === year;
            const isToday = date === today;
            const dueItems = active.filter((i) => isDue(i.schedule, date));
            const statuses = dueItems.map((i) => maps.get(i.id)?.[date]);
            const allMarked = dueItems.length > 0 && statuses.every((s) => s === 'done' || s === 'skipped');
            const missed = dueItems.length > 0 && date < today && statuses.some((s) => !s);
            const dots = statuses.slice(0, 3).map((status, idx) => ({
              key: idx,
              cls:
                status === 'done'
                  ? 'bg-accent-2'
                  : status === 'skipped'
                    ? 'bg-muted/35'
                    : date < today
                      ? 'bg-warn'
                      : 'bg-muted/60',
            }));
            const more = dueItems.length - 3;

            return (
              <button
                key={date}
                type="button"
                aria-label={fmtWeekdayDate(date)}
                onClick={() => setSelectedDay(date)}
                className={cn(
                  'relative flex aspect-square flex-col items-center justify-center gap-1 rounded-sq border transition duration-100 active:scale-[0.88] active:bg-surface-2',
                  inMonth ? 'border-transparent' : 'border-transparent opacity-35',
                  allMarked && 'bg-accent-2/12',
                  missed && 'bg-warn/10',
                  isToday && 'ring-1 ring-accent-2/70',
                )}
              >
                <span
                  className={cn(
                    'text-[13px] font-medium tabular-nums',
                    isToday ? 'text-accent-2' : inMonth ? 'text-text/90' : 'text-muted',
                  )}
                >
                  {dayNumber(date)}
                </span>
                <span className="flex h-1.5 items-center gap-[3px]" aria-hidden>
                  {dots.map((d) => (
                    <span key={d.key} className={cn('h-1 w-1 rounded-full', d.cls)} />
                  ))}
                  {more > 0 && <span className="text-[8px] leading-none text-muted">+{more}</span>}
                </span>
              </button>
            );
          })}
        </div>
      </motion.div>
      </AnimatePresence>

      <div className="flex flex-wrap gap-x-4 gap-y-1.5 px-1 text-[11px] text-muted">
        <LegendDot cls="bg-accent-2" label="done" />
        <LegendDot cls="bg-muted/60" label="pending" />
        <LegendDot cls="bg-warn" label="missed" />
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-[3px] bg-accent-2/20" /> all marked
        </span>
      </div>

      {/* Day sheet — same DayList as Today */}
      <Sheet
        open={selectedDay !== null}
        onClose={() => setSelectedDay(null)}
        title={selectedDay ? fmtWeekdayDate(selectedDay) : undefined}
        subtitle={selectedDay === today ? 'Today' : undefined}
        footer={
          selectedDay ? (
            <button
              type="button"
              onClick={() => {
                const day = selectedDay;
                setSelectedDay(null);
                navigate(`/?date=${day}`);
              }}
              className="min-h-11 w-full rounded-sq-md border border-surface-2 text-sm font-medium text-muted transition-colors hover:text-text"
            >
              Open in Today view
            </button>
          ) : undefined
        }
      >
        {selectedDay && (
          <DayList
            date={selectedDay}
            items={items}
            completions={completions}
            today={today}
            onEdit={(item) => {
              setSelectedDay(null);
              navigate(`/items/${item.id}`, { state: { background: location } });
            }}
          />
        )}
        {selectedDay && (
          <p className="mt-4 text-center text-xs text-muted">
            Tap the circle to mark done — any day is editable.
          </p>
        )}
      </Sheet>
    </div>
  );
}

function LegendDot({ cls, label }: { cls: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn('h-1.5 w-1.5 rounded-full', cls)} />
      {label}
    </span>
  );
}

import { useMemo, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { todayISO, weekOf, type ISODate, type Item } from '@pulsar/shared';
import { useItemsQuery, useSetCompletion } from '../lib/queries';
import { findMissed } from '../lib/missed';
import { addDays, fmtWeekdayDate } from '../lib/dates';
import { usePress } from '../lib/usePress';
import { BackfillSheet } from '../components/BackfillSheet';
import { DayList } from '../components/DayList';
import { MissedBanner } from '../components/MissedBanner';
import { WeekStrip } from '../components/WeekStrip';
import { usePagerSwipe } from '../lib/usePagerSwipe';

const MISSED_DISMISS_KEY = 'pulsar.dismissed-missed';

/** Today — the core screen. Also the day view for any past/future date. */
export function TodayPage() {
  const reduce = useReducedMotion();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { pressed: fabPressed, pressProps: fabPressProps } = usePress();

  const today = useMemo(() => todayISO(), []);
  const [selected, setSelected] = useState<ISODate>(() => {
    const param = searchParams.get('date');
    return param && /^\d{4}-\d{2}-\d{2}$/.test(param) ? param : today;
  });
  const [backfillOpen, setBackfillOpen] = useState(false);
  const [dir, setDir] = useState(1);
  const [dismissedOn, setDismissedOn] = useState<string | null>(
    () => localStorage.getItem(MISSED_DISMISS_KEY),
  );

  const { data, isLoading } = useItemsQuery();
  const items = data?.items ?? [];
  const completions = data?.completions ?? [];
  const setCompletion = useSetCompletion();

  // Day pager: 20px horizontal dead-zone before the drag engages, so vertical
  // list scrolling is never grabbed (see usePagerSwipe).
  const pager = usePagerSwipe({
    enabled: !reduce,
    distance: 64,
    onPrev: () => {
      setDir(-1);
      setSelected((d) => addDays(d, -1));
    },
    onNext: () => {
      setDir(1);
      setSelected((d) => addDays(d, 1));
    },
  });

  const week = useMemo(() => weekOf(selected), [selected]);
  const missed = useMemo(
    () => findMissed(items, completions, today),
    [items, completions, today],
  );

  const isPast = selected < today;
  const isFuture = selected > today;
  const title = isPast ? `Backfill · ${fmtWeekdayDate(selected)}` : fmtWeekdayDate(selected);

  function openItemForm(item: Item) {
    navigate(`/items/${item.id}`, { state: { background: location } });
  }

  function quickAdd() {
    navigate('/new', { state: { background: location } });
  }

  function dismissMissed() {
    localStorage.setItem(MISSED_DISMISS_KEY, today);
    setDismissedOn(today);
  }

  return (
    <div className="relative flex h-full min-h-0 flex-col gap-5 sm:pt-10">
      {/* Date header */}
      <header className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <motion.p
            key={selected}
            initial={reduce ? false : { opacity: 0, x: dir > 0 ? 16 : -16 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: reduce ? 0 : 0.18 }}
            className={`text-[11px] font-medium uppercase tracking-[0.14em] ${
              isPast ? 'text-warn' : isFuture ? 'text-muted' : 'text-accent-2'
            }`}
          >
            {isPast ? 'Catching up' : isFuture ? 'Scheduled' : 'Today'}
          </motion.p>
          <motion.h1
            key={`t-${selected}`}
            initial={reduce ? false : { opacity: 0, x: dir > 0 ? 24 : -24 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: reduce ? 0 : 0.2 }}
            className="truncate text-[28px] leading-tight font-medium text-text"
          >
            {title}
          </motion.h1>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <NavArrow direction="prev" onClick={() => { setDir(-1); setSelected((d) => addDays(d, -1)); }} />
          <NavArrow direction="next" onClick={() => { setDir(1); setSelected((d) => addDays(d, 1)); }} />
        </div>
      </header>

      {/* Always rendered (invisibly on today) so its appearance never shifts
          the content below. */}
      <button
        type="button"
        onClick={() => setSelected(today)}
        className={`-mt-3 self-start text-xs font-medium text-accent underline-offset-4 hover:underline ${
          selected === today ? 'invisible pointer-events-none' : ''
        }`}
      >
        Back to today
      </button>

      <MissedBanner
        count={missed.length}
        hidden={dismissedOn === today}
        onOpen={() => setBackfillOpen(true)}
        onDismiss={dismissMissed}
      />

      <WeekStrip
        week={week}
        selected={selected}
        today={today}
        items={items}
        completions={completions}
        onSelect={(d) => {
          setDir(d >= selected ? 1 : -1);
          setSelected(d);
        }}
      />

      {/* Day content — slides in from the side you navigate toward (same
          pager feel as the calendar months) and swipes left/right change the
          day. */}
      <AnimatePresence initial={false} mode="popLayout" custom={dir}>
        <motion.div
          key={selected}
          custom={dir}
          {...pager.dragProps}
          initial={reduce ? { opacity: 0 } : { opacity: 0, x: dir > 0 ? '35%' : '-35%' }}
          animate={{ opacity: 1, x: 0 }}
          /* Exit is a function variant so it resolves against AnimatePresence's
             live custom (the current dir), not this panel's frozen props —
             an inline object would exit toward the PREVIOUS direction after a
             back-and-forth. */
          variants={{ exit: (d: number) => (reduce ? { opacity: 0 } : { opacity: 0, x: d > 0 ? '-35%' : '35%' }) }}
          exit="exit"
          transition={{ duration: reduce ? 0 : 0.3, ease: [0.22, 1, 0.36, 1] }}
          className="flex min-h-0 flex-1 flex-col"
        >
          {/* The route root fills the AppShell column's content box, so the
              column stops scrolling — this is the day list's own scroll
              region. touch-pan-y keeps vertical list scrolling native while
              horizontal swipes keep paging days via the panel's drag="x". */}
          <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain pb-20 touch-pan-y">
            {isLoading && items.length === 0 ? (
              <div className="flex flex-col gap-2" aria-busy="true">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-[3.25rem] animate-pulse rounded-sq-lg bg-surface-2/60" />
                ))}
              </div>
            ) : (
              <DayList
                date={selected}
                items={items}
                completions={completions}
                today={today}
                onEdit={openItemForm}
              />
            )}
          </div>
        </motion.div>
      </AnimatePresence>

      {/* Quick add FAB — thumb zone, above the tab bar */}
      <motion.button
        type="button"
        onClick={quickAdd}
        aria-label="Add item"
        animate={{ scale: fabPressed ? 0.9 : 1 }}
        transition={{ duration: 0.12, ease: [0.22, 1, 0.36, 1] }}
        {...fabPressProps}
        className="fixed right-4 bottom-[calc(var(--tabbar-h)+env(safe-area-inset-bottom,0px)+1.25rem-var(--bottom-gap,0px))] z-40 flex h-14 w-14 items-center justify-center rounded-full bg-accent text-white shadow-[0_10px_32px_var(--glow-accent)] md:right-[max(1.5rem,calc(50vw-24rem))]"
      >
        <Plus size={26} strokeWidth={2} />
      </motion.button>

      <BackfillSheet
        open={backfillOpen}
        onClose={() => setBackfillOpen(false)}
        missed={missed}
        today={today}
        onDone={(occ) => setCompletion.mutate({ itemId: occ.item.id, date: occ.date, status: 'done' })}
        onSkip={(occ) => setCompletion.mutate({ itemId: occ.item.id, date: occ.date, status: 'skipped' })}
        onMarkAll={() => {
          for (const occ of missed) {
            setCompletion.mutate({ itemId: occ.item.id, date: occ.date, status: 'done' });
          }
        }}
      />
    </div>
  );
}

function NavArrow({
  direction,
  onClick,
}: {
  direction: 'prev' | 'next';
  onClick: () => void;
}) {
  const Icon = direction === 'prev' ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={direction === 'prev' ? 'Previous day' : 'Next day'}
      className="flex h-11 w-11 items-center justify-center rounded-full border border-surface-2 bg-surface/90 text-muted shadow-sm transition duration-100 hover:text-text active:scale-90 active:bg-surface-2"
    >
      <Icon size={20} strokeWidth={1.75} />
    </button>
  );
}

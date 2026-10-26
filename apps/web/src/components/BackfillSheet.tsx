import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { CheckCheck } from 'lucide-react';
import type { ISODate } from '@pulsar/shared';
import type { MissedOccurrence } from '../lib/missed';
import { fmtWeekdayDate } from '../lib/dates';
import { Sheet } from './Sheet';

interface BackfillSheetProps {
  open: boolean;
  onClose: () => void;
  missed: MissedOccurrence[];
  today: ISODate;
  onDone: (occ: MissedOccurrence) => void;
  onSkip: (occ: MissedOccurrence) => void;
  onMarkAll: () => void;
}

/**
 * The Backfill sheet: missed occurrences newest first, each with Done / Skip,
 * plus a bulk "Mark all done". Rows exit-animate as they're resolved.
 */
export function BackfillSheet({
  open,
  onClose,
  missed,
  today,
  onDone,
  onSkip,
  onMarkAll,
}: BackfillSheetProps) {
  const reduce = useReducedMotion();
  const grouped = groupByDate(missed);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Backfill"
      subtitle="A quick pass over what slipped — newest first."
      footer={
        missed.length > 1 ? (
          <button
            type="button"
            onClick={onMarkAll}
            className="flex min-h-11 w-full items-center justify-center gap-2 rounded-sq-md bg-accent text-sm font-medium text-white transition-transform active:scale-[0.98]"
          >
            <CheckCheck size={16} strokeWidth={1.75} />
            Mark all done
          </button>
        ) : undefined
      }
    >
      {missed.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted">
          All caught up — nothing missed lately.
        </p>
      ) : (
        <ul className="flex flex-col gap-4">
          {grouped.map(([date, occs]) => (
            <li key={date}>
              <h3 className="mb-1.5 px-1 text-xs font-medium uppercase tracking-wider text-muted">
                {date === today ? 'Today' : fmtWeekdayDate(date)}
              </h3>
              <ul className="flex flex-col gap-2">
                <AnimatePresence initial={false}>
                  {occs.map((occ) => (
                    <motion.li
                      key={`${occ.item.id}:${occ.date}`}
                      layout={!reduce}
                      initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.98 }}
                      animate={reduce ? { opacity: 1 } : { opacity: 1, scale: 1 }}
                      exit={
                        reduce
                          ? { opacity: 0, transition: { duration: 0.1 } }
                          : {
                              opacity: 0,
                              x: 28,
                              height: 0,
                              marginTop: 0,
                              transition: { duration: 0.22, ease: [0.4, 0, 1, 1] },
                            }
                      }
                      className="flex items-center gap-2 overflow-hidden rounded-sq-md border border-surface-2 bg-surface/80 px-3 py-2.5"
                    >
                      <span className="min-w-0 flex-1 truncate text-sm text-text">
                        {occ.item.title}
                        <span className="ml-2 text-xs text-muted">
                          {occ.date.slice(5).replace('-', '/')}
                        </span>
                      </span>
                      <button
                        type="button"
                        onClick={() => onDone(occ)}
                        className="min-h-9 shrink-0 rounded-full bg-accent-2 px-3.5 text-[13px] font-medium text-[#06251f] transition-transform active:scale-95"
                      >
                        Done
                      </button>
                      <button
                        type="button"
                        onClick={() => onSkip(occ)}
                        className="min-h-9 shrink-0 rounded-full border border-surface-2 px-3.5 text-[13px] font-medium text-muted transition hover:text-text active:scale-95 active:bg-surface-2/70"
                      >
                        Skip
                      </button>
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ul>
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  );
}

function groupByDate(missed: MissedOccurrence[]): Array<[ISODate, MissedOccurrence[]]> {
  const map = new Map<ISODate, MissedOccurrence[]>();
  for (const occ of missed) {
    const list = map.get(occ.date);
    if (list) list.push(occ);
    else map.set(occ.date, [occ]);
  }
  return [...map.entries()];
}

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Sparkles, TriangleAlert, X } from 'lucide-react';

interface MissedBannerProps {
  count: number;
  hidden: boolean;
  onOpen: () => void;
  onDismiss: () => void;
}

/** Amber banner on Today when the last 14 days have unmarked due items. */
export function MissedBanner({ count, hidden, onOpen, onDismiss }: MissedBannerProps) {
  const reduce = useReducedMotion();
  return (
    <AnimatePresence>
      {count > 0 && !hidden && (
        <motion.div
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: -8, height: 0 }}
          animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0, height: 'auto' }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, y: -6, height: 0 }}
          transition={{ type: 'spring', stiffness: 380, damping: 34 }}
          className="overflow-hidden"
        >
          <div className="flex items-center gap-3 rounded-sq-lg border border-warn/35 bg-warn/10 px-3.5 py-3">
            <TriangleAlert size={18} strokeWidth={1.75} className="shrink-0 text-warn" />
            <p className="min-w-0 flex-1 text-sm text-text">
              <span className="font-medium tabular-nums">{count}</span>{' '}
              {count === 1 ? 'missed check-in' : 'missed check-ins'} in the last two weeks
            </p>
            <button
              type="button"
              onClick={onOpen}
              className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full bg-warn/90 px-3 text-[13px] font-medium text-[#241503] transition-transform active:scale-95"
            >
              <Sparkles size={14} strokeWidth={1.75} />
              Backfill
            </button>
            <button
              type="button"
              aria-label="Dismiss missed check-ins banner"
              onClick={onDismiss}
              className="-m-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:text-text"
            >
              <X size={16} strokeWidth={1.75} />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

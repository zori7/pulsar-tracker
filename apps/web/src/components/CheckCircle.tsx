import { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Minus } from 'lucide-react';
import { cn } from '../lib/cn';
import { usePress } from '../lib/usePress';
import type { OccurrenceKind } from '../lib/missed';

interface CheckCircleProps {
  kind: OccurrenceKind;
  onToggle: () => void;
  'aria-label': string;
}

/**
 * The check-off control: empty ring → teal-filled check with a brief
 * "pulse" (scale keyframes + drawing check + glow ring), settling back.
 * `missed` (past due, unmarked) shows a soft amber ring as a hint.
 */
export function CheckCircle({ kind, onToggle, 'aria-label': ariaLabel }: CheckCircleProps) {
  const reduce = useReducedMotion();
  const done = kind === 'done';
  const skipped = kind === 'skipped';
  const missed = kind === 'missed';
  const { pressed, pressProps } = usePress();
  const [pulse, setPulse] = useState(false);
  const prevDone = useRef(done);

  // Brief scale pulse whenever this control flips to done.
  useEffect(() => {
    if (done && !prevDone.current) {
      setPulse(true);
      const t = setTimeout(() => setPulse(false), 400);
      prevDone.current = done;
      return () => clearTimeout(t);
    }
    prevDone.current = done;
  }, [done]);

  return (
    <motion.button
      type="button"
      aria-label={ariaLabel}
      aria-pressed={done}
      onClick={onToggle}
      animate={reduce ? { scale: 1 } : pulse ? { scale: [1, 1.22, 1] } : { scale: pressed ? 0.86 : 1 }}
      transition={{ type: 'spring', stiffness: 540, damping: 22, mass: 0.5 }}
      {...pressProps}
      className={cn(
        'relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
        done
          ? 'border-accent-2 bg-accent-2 shadow-[0_0_14px_var(--glow-teal)]'
          : skipped
            ? 'border-muted/60 bg-transparent'
            : missed
              ? 'border-warn/70 bg-warn/5'
              : 'border-surface-2 bg-transparent hover:border-accent/50',
      )}
    >
      {skipped ? (
        <Minus size={14} strokeWidth={2.5} className="text-muted" />
      ) : (
        <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
          <motion.path
            d="M5 12.5l4.5 4.5L19 7.5"
            stroke={done ? '#06251f' : 'transparent'}
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={false}
            animate={{ pathLength: done ? 1 : 0, opacity: done ? 1 : 0 }}
            transition={
              reduce
                ? { duration: 0 }
                : { pathLength: { type: 'spring', stiffness: 380, damping: 30, delay: 0.04 }, opacity: { duration: 0 } }
            }
          />
        </svg>
      )}
    </motion.button>
  );
}

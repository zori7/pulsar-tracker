import { motion, useReducedMotion } from 'framer-motion';
import type { LucideIcon } from 'lucide-react';
import { cn } from '../lib/cn';

interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  icon?: LucideIcon;
}

interface SegmentedProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: ReadonlyArray<SegmentedOption<T>>;
  layoutId: string;
  'aria-label': string;
  className?: string;
}

/**
 * Segmented control with an animated active pill (framer-motion layoutId).
 * Springs over eases; opacity-only when reduced motion is requested.
 */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  layoutId,
  className,
  'aria-label': ariaLabel,
}: SegmentedProps<T>) {
  const reduce = useReducedMotion();
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn(
        'flex w-full flex-wrap gap-1 rounded-sq-md border border-surface-2 bg-surface-2/70 p-1',
        className,
      )}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        const Icon = opt.icon;
        return (
          <button
            key={opt.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(opt.value)}
            className={cn(
              // grow + a min width so options wrap onto extra lines instead of
              // shrinking until the label clips (was flex-1 with no floor).
              'relative flex min-h-10 min-w-[4.75rem] grow items-center justify-center gap-1.5 rounded-sq px-2 text-[13px] font-medium transition-colors',
              active ? 'text-text' : 'text-muted hover:text-text/80',
            )}
          >
            {active && (
              <motion.span
                layoutId={layoutId}
                transition={
                  reduce
                    ? { duration: 0 }
                    : { type: 'spring', stiffness: 500, damping: 40, mass: 0.7 }
                }
                className="absolute inset-0 rounded-sq border border-surface-2 bg-surface shadow-sm"
                aria-hidden
              />
            )}
            <span className="relative z-10 flex items-center gap-1.5 truncate px-1">
              {Icon && <Icon size={15} strokeWidth={1.75} className="shrink-0" />}
              {opt.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

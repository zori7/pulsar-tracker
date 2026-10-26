import { motion, useReducedMotion } from 'framer-motion';
import { cn } from '../lib/cn';

interface SwitchProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  'aria-label': string;
  className?: string;
}

/** Pill switch used in settings. 44px hit area, springy knob. */
export function Switch({ checked, onChange, className, 'aria-label': ariaLabel }: SwitchProps) {
  const reduce = useReducedMotion();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative h-8 w-[3.75rem] shrink-0 rounded-full border transition-colors',
        checked
          ? 'border-accent bg-accent'
          : 'border-surface-2 bg-surface-2',
        className,
      )}
    >
      <motion.span
        layout
        transition={
          reduce ? { duration: 0 } : { type: 'spring', stiffness: 600, damping: 34, mass: 0.6 }
        }
        className="absolute top-1/2 block h-6 w-6 -translate-y-1/2 rounded-full bg-white shadow"
        style={checked ? { left: 'calc(100% - 1.625rem)' } : { left: '0.125rem' }}
        aria-hidden
      />
    </button>
  );
}

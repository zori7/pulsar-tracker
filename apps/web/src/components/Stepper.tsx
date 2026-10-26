import { Minus, Plus } from 'lucide-react';
import { cn } from '../lib/cn';

interface StepperProps {
  value: number;
  min: number;
  max: number;
  onChange: (next: number) => void;
  label: string;
  hint?: string;
  className?: string;
}

/** Numeric stepper: − [value] +, with 44px targets and clamped bounds. */
export function Stepper({ value, min, max, onChange, label, hint, className }: StepperProps) {
  const clamp = (n: number) => Math.min(max, Math.max(min, n));
  return (
    <div className={cn('flex items-center justify-between gap-3', className)}>
      <div className="min-w-0">
        <div className="text-sm font-medium text-text">{label}</div>
        {hint && <div className="mt-0.5 text-xs text-muted">{hint}</div>}
      </div>
      <div className="flex items-center gap-1 rounded-sq-md border border-surface-2 bg-surface-2/60 p-1">
        <button
          type="button"
          aria-label={`Decrease ${label}`}
          disabled={value <= min}
          onClick={() => onChange(clamp(value - 1))}
          className="flex h-11 w-11 items-center justify-center rounded-sq text-text transition-opacity disabled:opacity-30 active:scale-[0.94]"
        >
          <Minus size={18} strokeWidth={1.75} />
        </button>
        <span
          aria-live="polite"
          className="w-12 text-center text-lg font-medium tabular-nums text-text"
        >
          {value}
        </span>
        <button
          type="button"
          aria-label={`Increase ${label}`}
          disabled={value >= max}
          onClick={() => onChange(clamp(value + 1))}
          className="flex h-11 w-11 items-center justify-center rounded-sq text-text transition-opacity disabled:opacity-30 active:scale-[0.94]"
        >
          <Plus size={18} strokeWidth={1.75} />
        </button>
      </div>
    </div>
  );
}

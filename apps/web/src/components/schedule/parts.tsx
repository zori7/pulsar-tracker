import { useRef, useState, type KeyboardEvent } from 'react';
import { cn } from '../../lib/cn';

/** Small date field matching the form language. */
export function DateField({
  value,
  onChange,
  label,
  hint,
}: {
  value: string;
  onChange: (date: string) => void;
  label: string;
  hint?: string;
}) {
  return (
    <label className="block min-w-0 max-w-full">
      <span className="text-xs font-medium text-muted">{label}</span>
      <input
        type="date"
        className="field mt-1.5 min-w-0 max-w-full"
        value={value}
        onChange={(e) => {
          if (e.target.value) onChange(e.target.value);
        }}
      />
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

/** Preset chip row (weekday presets, N-on/M-off loop presets…). */
export function PresetRow({
  presets,
  onPick,
}: {
  presets: ReadonlyArray<{ key: string; label: string }>;
  onPick: (key: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {presets.map((p) => (
        <button
          key={p.key}
          type="button"
          onClick={() => onPick(p.key)}
          className="min-h-9 rounded-full border border-surface-2 bg-surface-2/60 px-3 text-xs font-medium text-muted transition hover:border-accent/40 hover:text-text active:scale-[0.96]"
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}

/** Plain-language schedule summary, always visible under the editor. */
export function SummaryBar({ text }: { text: string }) {
  return (
    <div className="rounded-sq-md border border-surface-2 bg-surface-2/40 px-3 py-2 text-[13px] text-muted">
      <span className="text-accent-2">Summary</span>
      <span className="mx-1.5 opacity-40">·</span>
      <span className="text-text">{text}</span>
    </div>
  );
}

/**
 * Roving-tabindex keyboard grid: arrows move focus across `count` cells
 * (7 columns), Home/End jump. Space is left to the button's native click.
 */
export function useRovingGrid(count: number, columns = 7) {
  const [focusIndex, setFocusIndex] = useState(0);
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number): void => {
    let next: number | null = null;
    switch (e.key) {
      case 'ArrowRight':
        next = (index + 1) % count;
        break;
      case 'ArrowLeft':
        next = (index - 1 + count) % count;
        break;
      case 'ArrowDown':
        next = Math.min(count - 1, index + columns);
        break;
      case 'ArrowUp':
        next = Math.max(0, index - columns);
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = count - 1;
        break;
      default:
        return;
    }
    e.preventDefault();
    setFocusIndex(next);
    refs.current[next]?.focus();
  };

  return { focusIndex, setFocusIndex, refs, onKeyDown };
}

export function FieldLabel({ children, htmlFor }: { children: string; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-xs font-medium text-muted">
      {children}
    </label>
  );
}

export function PanelStack({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('flex flex-col gap-4', className)}>{children}</div>;
}

import { useEffect, useMemo, useRef } from 'react';
import type { CycleSchedule, ISODate } from '@pulsar/shared';
import { addDays, createCyclePreset, describeSchedule, diffDays, isDue, nextOccurrences } from '@pulsar/shared';
import { weekdayLetter } from '../../lib/dates';
import { cn } from '../../lib/cn';
import { Stepper } from '../Stepper';
import { SquareToggle } from '../SquareToggle';
import { DateField, PresetRow, SummaryBar, useRovingGrid } from './parts';

const PRESETS = [
  { key: '2-3', label: '2 on / 3 off' },
  { key: '3-5', label: '3 on / 5 off' },
  { key: '1-1', label: 'Alternate days' },
] as const;

interface LoopEditorProps {
  value: CycleSchedule;
  onChange: (next: CycleSchedule) => void;
  today: ISODate;
}

/**
 * The signature control: loop length stepper, a strip of tappable squares
 * (tap + drag-to-paint + keyboard), N-on/M-off presets, anchor date, and a
 * live next-4-weeks preview anchored at the chosen start date.
 */
export function LoopEditor({ value, onChange, today }: LoopEditorProps) {
  const paintRef = useRef<boolean | null>(null);
  // Mirror of value.pattern that updates synchronously during drag-paint, so
  // fast pointer moves never act on a stale snapshot.
  const patternRef = useRef(value.pattern);
  patternRef.current = value.pattern;
  const { focusIndex, setFocusIndex, refs, onKeyDown } = useRovingGrid(value.length, 7);

  /** Resize the pattern, keeping surviving days' state; new days start at rest. */
  function setLength(length: number) {
    const next = Math.min(31, Math.max(1, length));
    if (next === value.length) return;
    const pattern = Array.from({ length: next }, (_, i) => patternRef.current[i] ?? false);
    ensureActive(pattern);
    patternRef.current = pattern;
    onChange({ ...value, length: next, pattern });
  }

  /** Set square i to `state` (never allowed to clear the last active day). */
  function paint(index: number, state: boolean) {
    if (patternRef.current[index] === state) return;
    const pattern = patternRef.current.slice();
    pattern[index] = state;
    if (!pattern.some(Boolean)) return;
    patternRef.current = pattern;
    onChange({ ...value, pattern });
  }

  function toggle(index: number) {
    paint(index, !value.pattern[index]);
  }

  /* ------------------------- drag-to-paint (pointer events) ------------------------- */

  // A single, stable window listener for the whole gesture. It reads/writes
  // refs so it never needs to re-attach when the pattern changes (re-attaching
  // mid-drag drops fast moves). Attached once on mount.
  useEffect(() => {
    const hitIndex = (x: number, y: number): number | null => {
      const el = document.elementFromPoint(x, y) as HTMLElement | null;
      const square = el?.closest('[data-loop-index]') as HTMLElement | null;
      return square ? Number(square.dataset.loopIndex) : null;
    };
    const onMove = (ev: PointerEvent) => {
      const target = paintRef.current;
      if (target === null) return;
      const i = hitIndex(ev.clientX, ev.clientY);
      if (i !== null) paint(i, target);
    };
    const onUp = () => {
      paintRef.current = null;
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function startPaint(e: React.PointerEvent<HTMLButtonElement>, index: number) {
    const target = !patternRef.current[index];
    paintRef.current = target;
    paint(index, target);
    setFocusIndex(index);
    // Touch pointers implicitly capture on the pressed element; release so the
    // finger can travel across squares and keep hitting them.
    if (e.pointerType === 'touch') {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* already released */
      }
    }
  }

  /* --------------------------------- presets --------------------------------- */

  function applyPreset(key: string) {
    const [on, off] = key.split('-').map(Number) as [number, number];
    const preset = createCyclePreset(on, off, value.anchor) as CycleSchedule;
    onChange(preset);
  }

  /* --------------------------------- preview ---------------------------------- */

  const previewDays = useMemo(() => {
    const days: Array<{ date: ISODate; active: boolean }> = [];
    for (let i = 0; i < 28; i++) {
      const date = addDays(value.anchor, i);
      days.push({ date, active: isDue(value, date) });
    }
    return days;
  }, [value]);

  const nextUp = useMemo(() => {
    // First five due days counted from the anchor (pattern day 1) — same
    // basis as the 28-day strip above. Scanning from `from` in a 5-day window
    // truncated the list whenever a rest was longer than 5 days.
    return nextOccurrences(value, value.anchor, 5);
  }, [value]);

  const activeCount = value.pattern.filter(Boolean).length;
  const inLoop = (date: ISODate) => diffDays(date, value.anchor) >= 0 && diffDays(date, value.anchor) < value.length;

  return (
    <div className="flex flex-col gap-5">
      <Stepper
        label="Length of one loop"
        hint={`${value.length} ${value.length === 1 ? 'day' : 'days'} before it repeats`}
        value={value.length}
        min={1}
        max={31}
        onChange={setLength}
      />

      {/* The squares */}
      <div>
        <div className="mb-2 flex items-baseline justify-between">
          <span className="text-xs font-medium text-muted">Tap or drag across the squares</span>
          <span className="text-xs tabular-nums text-muted">
            {activeCount} on · {value.length - activeCount} rest
          </span>
        </div>
        <div
          role="group"
          aria-label="Loop pattern"
          className="flex flex-wrap gap-1.5 rounded-sq-md border border-surface-2 bg-surface-2/30 p-2 select-none"
          style={{ touchAction: 'none' }}
          onDragStart={(e) => e.preventDefault()}
        >
          {value.pattern.map((on, i) => (
            <SquareToggle
              key={i}
              active={on}
              onToggle={() => toggle(i)}
              toggleOn="none"
              aria-label={`Day ${i + 1} of the loop — ${on ? 'active' : 'rest'}`}
              tabIndex={focusIndex === i ? 0 : -1}
              onKeyDown={(e) => {
                if (e.key === ' ' || e.key === 'Enter') {
                  e.preventDefault();
                  toggle(i);
                  return;
                }
                onKeyDown(e, i);
              }}
              onPointerDownCapture={(e) => startPaint(e, i)}
              dataLoopIndex={i}
              ref={(el) => {
                refs.current[i] = el;
              }}
              className="w-11"
            >
              {i + 1}
            </SquareToggle>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted">
          Square 1 is the start day. Arrows move, space toggles.
        </p>
      </div>

      <div>
        <span className="mb-2 block text-xs font-medium text-muted">Presets</span>
        <PresetRow presets={[...PRESETS]} onPick={applyPreset} />
      </div>

      <DateField
        label="Start date (anchor)"
        value={value.anchor}
        onChange={(anchor) => onChange({ ...value, anchor })}
        hint="Day 1 of every loop. The pattern repeats counting from this date."
      />

      {/* Live 4-week preview */}
      <div>
        <span className="mb-2 block text-xs font-medium text-muted">Next 4 weeks</span>
        <div className="rounded-sq-md border border-surface-2 bg-surface-2/30 p-2">
          <div className="mb-1 grid grid-cols-7 gap-1 text-center text-[10px] font-medium text-muted">
            {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
              <span key={i}>{d}</span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {previewDays.map(({ date, active }) => (
              <div
                key={date}
                title={describeSchedule(value)}
                className={cn(
                  'flex h-9 items-center justify-center rounded-[7px] border text-[11px] tabular-nums',
                  active
                    ? 'border-accent bg-accent/90 text-white shadow-[0_0_8px_var(--glow-accent)]'
                    : 'border-surface-2 bg-surface-2/50 text-muted/70',
                  date === today && 'ring-1 ring-accent-2',
                  inLoop(date) && !active && 'border-dashed',
                )}
              >
                {Number(date.slice(8, 10))}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Next occurrences */}
      <div>
        <span className="mb-2 block text-xs font-medium text-muted">Next up</span>
        <div className="flex flex-wrap gap-1.5">
          {nextUp.length === 0 && <span className="text-sm text-muted">No upcoming days — add an active square.</span>}
          {nextUp.map((date) => (
            <span
              key={date}
              className="inline-flex items-center gap-1.5 rounded-full border border-accent/40 bg-accent/10 px-2.5 py-1 text-xs tabular-nums text-text"
            >
              <span className="text-muted">{weekdayLetter(date)}</span>
              {date.slice(5).replace('-', '/')}
            </span>
          ))}
        </div>
      </div>

      <SummaryBar text={describeSchedule(value)} />
    </div>
  );
}

function ensureActive(pattern: boolean[]): void {
  if (!pattern.some(Boolean) && pattern.length > 0) pattern[0] = true;
}

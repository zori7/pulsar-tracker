import { useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import type {
  IntervalSchedule,
  ItemKind,
  ISODate,
  MonthdaysSchedule,
  OnceSchedule,
  Schedule,
  ScheduleType,
  WeekdaysSchedule,
  Weekday,
} from '@pulsar/shared';
import {
  WEEKDAY_LABELS,
  WEEKDAY_NAMES,
  createDefaultSchedule,
  describeSchedule,
  nextOccurrences,
  todayISO,
} from '@pulsar/shared';
import { Segmented } from '../Segmented';
import { SquareToggle } from '../SquareToggle';
import { Stepper } from '../Stepper';
import { DateField, PanelStack, PresetRow, SummaryBar, useRovingGrid } from './parts';
import { LoopEditor } from './LoopEditor';

export interface ScheduleEditorProps {
  value: Schedule;
  onChange: (next: Schedule) => void;
  kind: ItemKind;
  today?: ISODate;
}

const TYPE_OPTIONS: ReadonlyArray<{ value: ScheduleType; label: string }> = [
  { value: 'once', label: 'Once' },
  { value: 'weekdays', label: 'Weekdays' },
  { value: 'monthdays', label: 'Month day' },
  { value: 'interval', label: 'Every X' },
  { value: 'cycle', label: 'Loop' },
];

/**
 * The schedule selector: segmented type switch (animated pill) with five
 * panels that crossfade. Weekday / monthday / loop controls share one square
 * language. Todos are locked to the one-time panel.
 */
export function ScheduleEditor({ value, onChange, kind, today = todayISO() }: ScheduleEditorProps) {
  const isTodo = kind === 'todo';
  const reduce = useReducedMotion();

  function pickType(type: ScheduleType) {
    if (type === value.type) return;
    onChange(createDefaultSchedule(type, today));
  }

  return (
    <div className="flex flex-col gap-4">
      {!isTodo && (
        <Segmented
          aria-label="Schedule type"
          layoutId="schedule-type-pill"
          value={value.type}
          onChange={pickType}
          options={[...TYPE_OPTIONS]}
        />
      )}

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={value.type}
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, y: -6 }}
          transition={{ duration: reduce ? 0 : 0.17, ease: [0.22, 1, 0.36, 1] }}
        >
          {value.type === 'once' && <OncePanel value={value} onChange={onChange} today={today} />}
          {value.type === 'weekdays' && <WeekdaysPanel value={value} onChange={onChange} />}
          {value.type === 'monthdays' && <MonthdaysPanel value={value} onChange={onChange} />}
          {value.type === 'interval' && (
            <IntervalPanel value={value} onChange={onChange} />
          )}
          {value.type === 'cycle' && <LoopEditor value={value} onChange={onChange} today={today} />}
        </motion.div>
      </AnimatePresence>

      {isTodo && <p className="text-xs text-muted">Todos happen once — pick the day it's due.</p>}
    </div>
  );
}

/* ---------------------------------------------------------------- once */

function OncePanel({
  value,
  onChange,
  today,
}: {
  value: OnceSchedule;
  onChange: (s: OnceSchedule) => void;
  today: ISODate;
}) {
  const relation =
    value.date === today ? 'today' : value.date > today ? 'in the future' : 'in the past';
  return (
    <PanelStack>
      <DateField
        label="Due date"
        value={value.date}
        onChange={(date) => onChange({ type: 'once', date })}
        hint={`One shot, ${relation}. Backdated todos still count.`}
      />
      <SummaryBar text={describeSchedule(value)} />
    </PanelStack>
  );
}

/* ------------------------------------------------------------ weekdays */

const WEEKDAY_PRESETS = [
  { key: 'all', label: 'Every day' },
  { key: 'weekdays', label: 'Weekdays' },
  { key: 'weekends', label: 'Weekends' },
] as const;

function WeekdaysPanel({
  value,
  onChange,
}: {
  value: WeekdaysSchedule;
  onChange: (s: WeekdaysSchedule) => void;
}) {
  const [warn, setWarn] = useState(false);

  function toggle(day: Weekday) {
    const has = value.weekdays.includes(day);
    if (has && value.weekdays.length === 1) {
      setWarn(true);
      setTimeout(() => setWarn(false), 1600);
      return;
    }
    const weekdays = has
      ? value.weekdays.filter((d) => d !== day)
      : [...value.weekdays, day].sort((a, b) => a - b);
    onChange({ type: 'weekdays', weekdays });
  }

  function applyPreset(key: string) {
    const weekdays: Weekday[] =
      key === 'all' ? [0, 1, 2, 3, 4, 5, 6] : key === 'weekdays' ? [1, 2, 3, 4, 5] : [0, 6];
    onChange({ type: 'weekdays', weekdays });
  }

  return (
    <PanelStack>
      <div className="flex flex-wrap justify-center gap-1.5">
        {WEEKDAY_LABELS.map((letter, day) => (
          <SquareToggle
            key={day}
            shape="round"
            active={value.weekdays.includes(day as Weekday)}
            onToggle={() => toggle(day as Weekday)}
            aria-label={WEEKDAY_NAMES[day] ?? `Day ${day}`}
            className="h-12 w-12 shrink-0"
          >
            {letter}
          </SquareToggle>
        ))}
      </div>
      {warn && <p className="-mt-2 text-xs text-warn">Keep at least one day.</p>}
      <PresetRow presets={[...WEEKDAY_PRESETS]} onPick={applyPreset} />
      <SummaryBar text={describeSchedule(value)} />
    </PanelStack>
  );
}

/* ----------------------------------------------------------- monthdays */

function MonthdaysPanel({
  value,
  onChange,
}: {
  value: MonthdaysSchedule;
  onChange: (s: MonthdaysSchedule) => void;
}) {
  const { focusIndex, refs, onKeyDown } = useRovingGrid(31, 6);
  const [warn, setWarn] = useState(false);

  function toggle(day: number) {
    const has = value.monthdays.includes(day);
    if (has && value.monthdays.length === 1) {
      setWarn(true);
      setTimeout(() => setWarn(false), 1600);
      return;
    }
    const monthdays = has
      ? value.monthdays.filter((d) => d !== day)
      : [...value.monthdays, day].sort((a, b) => a - b);
    onChange({ type: 'monthdays', monthdays });
  }

  return (
    <PanelStack>
      <div className="grid grid-cols-6 min-[420px]:grid-cols-8 gap-1.5">
        {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
          <SquareToggle
            key={day}
            active={value.monthdays.includes(day)}
            onToggle={() => toggle(day)}
            aria-label={`Day ${day} of the month`}
            tabIndex={focusIndex === day - 1 ? 0 : -1}
            onKeyDown={(e) => onKeyDown(e, day - 1)}
            ref={(el) => {
              refs.current[day - 1] = el;
            }}
            className="w-full"
          >
            {day}
          </SquareToggle>
        ))}
      </div>
      {warn && <p className="-mt-2 text-xs text-warn">Keep at least one day.</p>}
      <PresetRow
        presets={[{ key: '1-15', label: '1st & 15th' }]}
        onPick={() => onChange({ type: 'monthdays', monthdays: [1, 15] })}
      />
      <p className="text-xs text-muted">Months without that day (like Feb 31) simply skip it.</p>
      <SummaryBar text={describeSchedule(value)} />
    </PanelStack>
  );
}

/* ------------------------------------------------------------ interval */

function IntervalPanel({
  value,
  onChange,
}: {
  value: IntervalSchedule;
  onChange: (s: IntervalSchedule) => void;
}) {
  // Preview counts from the ANCHOR (pattern day 1), not from today — a
  // from-today preview made a past start date invisible ("every 1 day"
  // showed the same chips for any anchor).
  const preview = useMemo(() => nextOccurrences(value, value.anchor, 5), [value]);

  return (
    <PanelStack>
      <Stepper
        label="Repeat every"
        hint={value.every === 1 ? 'day' : 'days — the start date counts as day 1'}
        value={value.every}
        min={1}
        max={60}
        onChange={(every) => onChange({ ...value, every })}
      />
      <DateField
        label="Start date (anchor)"
        value={value.anchor}
        onChange={(anchor) => onChange({ ...value, anchor })}
      />
      <div>
        <span className="mb-2 block text-xs font-medium text-muted">Next up</span>
        <div className="flex flex-wrap gap-1.5">
          {preview.map((date) => (
            <span
              key={date}
              className="rounded-full border border-accent/40 bg-accent/10 px-2.5 py-1 text-xs tabular-nums text-text"
            >
              {date.slice(5).replace('-', '/')}
            </span>
          ))}
          {preview.length === 0 && (
            <span className="text-sm text-muted">Nothing in the next two years.</span>
          )}
        </div>
      </div>
      <SummaryBar text={describeSchedule(value)} />
    </PanelStack>
  );
}

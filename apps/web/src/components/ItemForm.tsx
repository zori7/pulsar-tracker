import { useEffect, useMemo, useState } from 'react';
import { Bell, Trash2 } from 'lucide-react';
import type { Item, ItemKind, Schedule } from '@pulsar/shared';
import { createDefaultSchedule, todayISO, validateSchedule } from '@pulsar/shared';
import { Segmented } from './Segmented';
import { ScheduleEditor } from './schedule/ScheduleEditor';
import { cn } from '../lib/cn';

export interface ItemFormValue {
  kind: ItemKind;
  title: string;
  description: string | null;
  schedule: Schedule;
  reminderTime: string | null;
}

interface ItemFormProps {
  mode: 'create' | 'edit';
  initial?: Item;
  saving: boolean;
  /** Prefill for a new item's reminder (settings.digestTime, fallback 09:00). */
  defaultReminderTime?: string;
  onSave: (value: ItemFormValue) => void;
  onCancel: () => void;
  onDelete?: () => void;
  onArchiveToggle?: () => void;
}

/**
 * The one create/edit form — used full-screen on phones and as a modal card
 * on desktop (both routed through <ItemFormPage>).
 */
export function ItemForm({
  mode,
  initial,
  saving,
  defaultReminderTime,
  onSave,
  onCancel,
  onDelete,
  onArchiveToggle,
}: ItemFormProps) {
  const today = useMemo(() => todayISO(), []);
  const [kind, setKind] = useState<ItemKind>(initial?.kind ?? 'habit');
  const [title, setTitle] = useState(initial?.title ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [schedule, setSchedule] = useState<Schedule>(
    initial?.schedule ?? createDefaultSchedule('weekdays', today),
  );
  // New items get a reminder on by default (digest time); edits keep the item's own.
  const [reminderTime, setReminderTime] = useState(
    initial?.reminderTime ?? defaultReminderTime ?? '',
  );
  const [submitted, setSubmitted] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Todos are one-time only (SPEC §2 validation).
  useEffect(() => {
    if (kind === 'todo' && schedule.type !== 'once') {
      setSchedule(createDefaultSchedule('once', today));
    }
  }, [kind, schedule.type, today]);

  const errors = useMemo(() => {
    const list: string[] = [];
    if (!title.trim()) list.push('Give it a name.');
    list.push(...validateSchedule(schedule, kind));
    return list;
  }, [title, schedule, kind]);

  function submit() {
    setSubmitted(true);
    if (errors.length > 0) return;
    onSave({
      kind,
      title: title.trim(),
      description: description.trim() || null,
      schedule,
      reminderTime: reminderTime || null,
    });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* overflow-x is explicitly locked: scroll-y alone would let it compute
          to auto (per CSS) and any wide child would drag the sheet sideways. */}
      <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain px-5 py-4">
        <div className="flex flex-col gap-6">
          {/* Kind */}
          <div>
            {mode === 'create' ? (
              <Segmented
                aria-label="Item kind"
                layoutId="item-kind-pill"
                value={kind}
                onChange={(k) => setKind(k)}
                options={[
                  { value: 'habit', label: 'Habit' },
                  { value: 'todo', label: 'Todo' },
                ]}
              />
            ) : (
              <p className="text-xs font-medium uppercase tracking-wider text-muted">
                {initial?.kind === 'habit' ? 'Habit' : 'Todo'}
              </p>
            )}
          </div>

          {/* Title + description */}
          <div className="flex flex-col gap-3">
            <div>
              <label htmlFor="item-title" className="mb-1.5 block text-xs font-medium text-muted">
                Name
              </label>
              <input
                id="item-title"
                className="field"
                placeholder={kind === 'habit' ? 'Stretch for ten minutes' : 'Water the plants'}
                value={title}
                maxLength={120}
                autoFocus={mode === 'create'}
                onChange={(e) => setTitle(e.target.value)}
              />
              {submitted && !title.trim() && (
                <p className="mt-1 text-xs text-danger">Give it a name.</p>
              )}
            </div>
            <div>
              <label htmlFor="item-desc" className="mb-1.5 block text-xs font-medium text-muted">
                Note <span className="normal-case text-muted/70">(optional)</span>
              </label>
              <input
                id="item-desc"
                className="field"
                placeholder="Anything worth remembering"
                value={description}
                maxLength={240}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
          </div>

          {/* Schedule — the hero */}
          <div>
            <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted">Schedule</h3>
            <ScheduleEditor value={schedule} onChange={(s) => setSchedule(s)} kind={kind} today={today} />
            <p className="mt-2 text-xs text-muted">
              {mode === 'edit'
                ? 'Schedule changes apply to past days too — the loop re-checks history.'
                : 'Backdate freely — the pattern counts from the start date.'}
            </p>
          </div>

          {/* Reminder */}
          <div>
            <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted">Reminder</h3>
            <div className="flex items-center gap-3 rounded-sq-md border border-surface-2 bg-surface-2/40 px-3 py-2.5">
              <Bell size={17} strokeWidth={1.75} className="shrink-0 text-muted" />
              <label htmlFor="item-reminder" className="min-w-0 flex-1 text-sm text-text">
                ntfy push at
                <input
                  id="item-reminder"
                  type="time"
                  value={reminderTime}
                  onChange={(e) => setReminderTime(e.target.value)}
                  className="ml-2 min-w-0 max-w-full rounded-sq border border-surface-2 bg-surface px-2 py-1 text-base tabular-nums"
                />
              </label>
              {reminderTime && (
                <button
                  type="button"
                  onClick={() => setReminderTime('')}
                  className="shrink-0 text-xs text-muted underline-offset-2 hover:text-text hover:underline"
                >
                  Clear
                </button>
              )}
            </div>
            <p className="mt-1.5 text-xs text-muted">A gentle nudge at this time — needs notifications on in settings.</p>
          </div>

          {/* Edit-only actions */}
          {mode === 'edit' && (onDelete || onArchiveToggle) && (
            <div className="flex flex-col gap-2 border-t border-surface-2 pt-4">
              {onArchiveToggle && (
                <button
                  type="button"
                  onClick={onArchiveToggle}
                  className="min-h-11 rounded-sq-md border border-surface-2 px-4 text-sm text-text transition-colors hover:bg-surface-2"
                >
                  {initial?.archived ? 'Restore from archive' : 'Archive item'}
                </button>
              )}
              {onDelete && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (confirmDelete) onDelete();
                      else {
                        setConfirmDelete(true);
                        setTimeout(() => setConfirmDelete(false), 3000);
                      }
                    }}
                    className={cn(
                      'inline-flex min-h-11 items-center gap-2 rounded-sq-md px-4 text-sm transition-colors',
                      confirmDelete
                        ? 'bg-danger/15 text-danger'
                        : 'border border-surface-2 text-danger hover:bg-surface-2',
                    )}
                  >
                    <Trash2 size={15} strokeWidth={1.75} />
                    {confirmDelete ? 'Tap again to delete' : 'Delete item'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Actions — a real footer (sibling of the scroll region), flush at the
          bottom of the sheet. Only the safe-area strip below the buttons (with a
          0.75rem floor for browser tabs, where the inset is 0) —
          and + --drawer-keyboard-inset lifts the bar above the iOS keyboard
          while a form drawer is open (the var is 0 unless a Base UI Drawer
          keyboard is aligned). */}
      <div className="shrink-0 border-t border-surface-2 bg-surface px-5 pt-3 pb-[calc(max(0.75rem,env(safe-area-inset-bottom,0px))+var(--drawer-keyboard-inset,0px))] transition-[padding-bottom] duration-[260ms] ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="min-h-12 flex-1 rounded-sq-md border border-surface-2 text-sm font-medium text-muted transition-colors hover:text-text"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={saving || (submitted && errors.length > 0)}
            className={cn(
              'min-h-12 flex-[2] rounded-sq-md text-sm font-medium text-white transition-transform active:scale-[0.98]',
              errors.length > 0 && submitted
                ? 'bg-muted/40'
                : 'bg-accent shadow-[0_6px_24px_var(--glow-accent)]',
            )}
          >
            {saving ? 'Saving…' : mode === 'create' ? 'Add item' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

import { useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';
import { useReducedMotion } from 'framer-motion';
import type { Item } from '@pulsar/shared';
import { addDays, isDue, todayISO } from '@pulsar/shared';
import type { ItemFormValue } from '../components/ItemForm';
import { ItemForm } from '../components/ItemForm';
import { Sheet } from '../components/Sheet';
import {
  useCreateItem,
  useDeleteItem,
  useItemsQuery,
  useSettingsQuery,
  useUpdateItem,
} from '../lib/queries';
import { fmtMonthDay } from '../lib/dates';

/**
 * Route page for both `/new` and `/items/:id`. Bottom sheet on phones (Base UI
 * Drawer — swipe down to dismiss), centered modal card on desktop. When opened
 * from a background location (Today / Items / Calendar), closing returns there;
 * a direct URL load falls back to /items.
 */
export function ItemFormPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const reduce = useReducedMotion();

  const background = (location.state as { background?: unknown } | null)?.background != null;
  const isCreate = !id;

  const { data, isLoading } = useItemsQuery();
  const item = id ? data?.items.find((i) => i.id === id) : undefined;

  // New items default their reminder to the daily digest time (fallback 09:00).
  const { data: settingsData } = useSettingsQuery();
  const defaultReminderTime = settingsData?.settings.digestTime ?? '09:00';

  const createMut = useCreateItem();
  const updateMut = useUpdateItem();
  const deleteMut = useDeleteItem();

  const [open, setOpen] = useState(true);

  const saving = createMut.isPending || updateMut.isPending || deleteMut.isPending;

  function close() {
    setOpen(false);
    // Let the exit animation play before unmounting the route: the drawer's
    // close transition runs ~380ms (the desktop card spring is shorter).
    window.setTimeout(
      () => (background ? navigate(-1) : navigate('/items')),
      reduce ? 0 : 450,
    );
  }

  function save(value: ItemFormValue) {
    if (isCreate) {
      createMut.mutate(
        { kind: value.kind, title: value.title, description: value.description, schedule: value.schedule, reminderTime: value.reminderTime },
        { onSuccess: () => navigateAfterMutation() },
      );
    } else if (id) {
      updateMut.mutate(
        { id, body: { title: value.title, description: value.description, schedule: value.schedule, reminderTime: value.reminderTime } },
        { onSuccess: () => navigateAfterMutation() },
      );
    }
  }

  function navigateAfterMutation() {
    setOpen(false);
    if (background) navigate(-1);
    else navigate('/items');
  }

  const title = isCreate
    ? 'New item'
    : item
      ? `Edit · ${item.title}`
      : 'Edit item';

  const subtitle = !isCreate && item ? `${item.kind === 'habit' ? 'Habit' : 'Todo'} · due ${fmtMonthDay(nextDueHint(item))}` : undefined;

  return (
    <Sheet open={open} onClose={close} presentation="sheet" title={title} subtitle={subtitle} scrollBody={false}>
      {isCreate ? (
        <ItemForm
          mode="create"
          saving={saving}
          defaultReminderTime={defaultReminderTime}
          onSave={save}
          onCancel={close}
        />
      ) : isLoading || !item ? (
        <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-5 py-4" aria-busy="true">
          <div className="flex flex-col gap-3">
            <div className="h-8 w-40 animate-pulse rounded-sq bg-surface-2" />
            <div className="h-11 w-full animate-pulse rounded-sq-md bg-surface-2" />
            <div className="h-40 w-full animate-pulse rounded-sq-lg bg-surface-2" />
            {!item && !isLoading && (
              <p className="pt-4 text-center text-sm text-muted">That item is gone.</p>
            )}
          </div>
        </div>
      ) : (
        <ItemForm
          mode="edit"
          initial={item}
          saving={saving}
          onSave={save}
          onCancel={close}
          onDelete={() =>
            deleteMut.mutate(item.id, {
              onSuccess: () => navigateAfterMutation(),
            })
          }
          onArchiveToggle={() =>
            updateMut.mutate({ id: item.id, body: { archived: !item.archived } })
          }
        />
      )}
    </Sheet>
  );
}

function nextDueHint(item: Item): string {
  const today = todayISO();
  for (let i = 0; i < 90; i++) {
    const date = addDays(today, i);
    if (isDue(item.schedule, date)) return date;
  }
  return today;
}

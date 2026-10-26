import { useMemo } from 'react';
import type { Completion, Item, ISODate } from '@pulsar/shared';
import { currentStreak, isDue, toCompletionMap, todayISO } from '@pulsar/shared';
import { useSetCompletion } from '../lib/queries';
import { ItemRow } from './ItemRow';

interface DayListProps {
  date: ISODate;
  items: Item[];
  completions: readonly Completion[];
  today?: ISODate;
  onEdit: (item: Item) => void;
}

/**
 * The day's due items grouped Habits / Todos — shared by Today and the
 * calendar day sheet. Every past / today / future date is editable with the
 * same interactions (backfill and pre-skip alike).
 */
export function DayList({ date, items, completions, today = todayISO(), onEdit }: DayListProps) {
  const setCompletion = useSetCompletion();

  const groups = useMemo(() => {
    const maps = new Map<string, ReturnType<typeof toCompletionMap>>();
    for (const item of items) maps.set(item.id, toCompletionMap(item.id, completions));
    const due = items.filter((i) => !i.archived && isDue(i.schedule, date));
    const habits = due.filter((i) => i.kind === 'habit');
    const todos = due.filter((i) => i.kind === 'todo');
    return { habits, todos, maps };
  }, [items, completions, date]);

  function toggleDone(item: Item) {
    const map = groups.maps.get(item.id);
    const status = map?.[date];
    setCompletion.mutate({
      itemId: item.id,
      date,
      status: status === 'done' ? null : 'done',
    });
  }

  function skip(item: Item) {
    setCompletion.mutate({ itemId: item.id, date, status: 'skipped' });
  }

  function unskip(item: Item) {
    setCompletion.mutate({ itemId: item.id, date, status: null });
  }

  if (groups.habits.length === 0 && groups.todos.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted">
        Nothing due on this day — enjoy the quiet.
      </p>
    );
  }

  const renderRow = (item: Item, index: number) => (
    <ItemRow
      key={item.id}
      item={item}
      index={index}
      date={date}
      today={today}
      status={groups.maps.get(item.id)?.[date]}
      streak={
        item.kind === 'habit'
          ? currentStreak(item.schedule, groups.maps.get(item.id) ?? {}, today)
          : 0
      }
      onToggleDone={() => toggleDone(item)}
      onSkip={() => skip(item)}
      onUnskip={() => unskip(item)}
      onEdit={() => onEdit(item)}
    />
  );

  return (
    <div className="flex flex-col gap-6">
      {groups.habits.length > 0 && (
        <section>
          <h3 className="mb-2 px-1 text-xs font-medium uppercase tracking-wider text-muted">
            Habits
          </h3>
          <ul className="flex flex-col gap-2">{groups.habits.map(renderRow)}</ul>
        </section>
      )}
      {groups.todos.length > 0 && (
        <section>
          <h3 className="mb-2 px-1 text-xs font-medium uppercase tracking-wider text-muted">
            Todos
          </h3>
          <ul className="flex flex-col gap-2">{groups.todos.map(renderRow)}</ul>
        </section>
      )}
    </div>
  );
}

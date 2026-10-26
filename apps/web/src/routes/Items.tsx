import { useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { motion, useReducedMotion } from 'framer-motion';
import { Archive, ArchiveRestore, Bell, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react';
import { currentStreak, describeSchedule, toCompletionMap, todayISO, type Item } from '@pulsar/shared';
import { useDeleteItem, useItemsQuery, useUpdateItem } from '../lib/queries';
import { Segmented } from '../components/Segmented';
import { MenuPanel } from '../components/MenuPanel';
import { StreakBadge } from '../components/StreakBadge';
import { cn } from '../lib/cn';
import { usePress } from '../lib/usePress';

type Filter = 'all' | 'habit' | 'todo';

/** Items — every item including archived, with edit / archive / delete. */
export function ItemsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const reduce = useReducedMotion();
  const today = useMemo(() => todayISO(), []);

  const { data, isLoading } = useItemsQuery();
  const updateMut = useUpdateItem();
  const deleteMut = useDeleteItem();

  const [filter, setFilter] = useState<Filter>('all');
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const items = data?.items ?? [];
  const completions = data?.completions ?? [];

  const { active, archived } = useMemo(() => {
    const match = (i: Item) => filter === 'all' || i.kind === filter;
    return {
      active: items.filter((i) => !i.archived && match(i)),
      archived: items.filter((i) => i.archived && match(i)),
    };
  }, [items, filter]);

  function openForm(item: Item) {
    navigate(`/items/${item.id}`, { state: { background: location } });
  }

  function streakOf(item: Item): number {
    if (item.kind !== 'habit') return 0;
    return currentStreak(item.schedule, toCompletionMap(item.id, completions), today);
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-5 sm:pt-10">
      <header className="flex items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-accent-2">
            Library
          </p>
          <h1 className="text-[28px] leading-tight font-medium text-text">Items</h1>
        </div>
        <button
          type="button"
          onClick={() => navigate('/new', { state: { background: location } })}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-sq-md bg-accent px-4 text-sm font-medium text-white shadow-[0_6px_20px_var(--glow-accent)] transition-transform active:scale-95"
        >
          <Plus size={16} strokeWidth={2} />
          Add
        </button>
      </header>

      <Segmented
        aria-label="Filter items"
        layoutId="items-filter-pill"
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'all', label: 'All' },
          { value: 'habit', label: 'Habits' },
          { value: 'todo', label: 'Todos' },
        ]}
      />

      {/* The route root fills the AppShell column's content box, so the
          column stops scrolling — this is the list's own scroll region. */}
      <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain">
        {isLoading && items.length === 0 ? (
          <div className="flex flex-col gap-2" aria-busy="true">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-16 animate-pulse rounded-sq-lg bg-surface-2/60" />
            ))}
          </div>
        ) : active.length === 0 && archived.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-12">
            <p className="text-sm text-muted">Nothing here yet — one small habit is a good start.</p>
            <button
              type="button"
              onClick={() => navigate('/new', { state: { background: location } })}
              className="min-h-11 rounded-sq-md bg-accent px-5 text-sm font-medium text-white transition-transform active:scale-95"
            >
              Add your first habit
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            <ul className="flex flex-col gap-2">
              {active.map((item, i) => (
                <ItemLibraryRow
                  key={item.id}
                  item={item}
                  index={i}
                  streak={streakOf(item)}
                  reduce={!!reduce}
                  menuOpen={menuFor === item.id}
                  setMenuOpen={(v) => setMenuFor(v ? item.id : null)}
                  confirmDelete={confirmDelete === item.id}
                  onEdit={() => openForm(item)}
                  onArchiveToggle={() =>
                    updateMut.mutate({ id: item.id, body: { archived: true } })
                  }
                  onDelete={() => {
                    if (confirmDelete === item.id) {
                      deleteMut.mutate(item.id);
                      setConfirmDelete(null);
                      setMenuFor(null);
                    } else {
                      setConfirmDelete(item.id);
                    }
                  }}
                />
              ))}
            </ul>

            {archived.length > 0 && (
              <section>
                <h2 className="mb-2 px-1 text-xs font-medium uppercase tracking-wider text-muted">
                  Archived
                </h2>
                <ul className="flex flex-col gap-2">
                  {archived.map((item, i) => (
                    <ItemLibraryRow
                      key={item.id}
                      item={item}
                      index={i}
                      streak={0}
                      reduce={!!reduce}
                      menuOpen={menuFor === item.id}
                      setMenuOpen={(v) => setMenuFor(v ? item.id : null)}
                      confirmDelete={confirmDelete === item.id}
                      onEdit={() => openForm(item)}
                      onArchiveToggle={() =>
                        updateMut.mutate({ id: item.id, body: { archived: false } })
                      }
                      onDelete={() => {
                        if (confirmDelete === item.id) {
                          deleteMut.mutate(item.id);
                          setConfirmDelete(null);
                          setMenuFor(null);
                        } else {
                          setConfirmDelete(item.id);
                        }
                      }}
                    />
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}
      </div>

      {/* Menu scrim */}
      {menuFor !== null && (
        <button
          type="button"
          aria-label="Close menu"
          className="fixed inset-0 z-20 cursor-default"
          onClick={() => setMenuFor(null)}
        />
      )}
    </div>
  );
}

function ItemLibraryRow({
  item,
  index,
  streak,
  reduce,
  menuOpen,
  setMenuOpen,
  confirmDelete,
  onEdit,
  onArchiveToggle,
  onDelete,
}: {
  item: Item;
  index: number;
  streak: number;
  reduce: boolean;
  menuOpen: boolean;
  setMenuOpen: (open: boolean) => void;
  confirmDelete: boolean;
  onEdit: () => void;
  onArchiveToggle: () => void;
  onDelete: () => void;
}) {
  const menuBtnRef = useRef<HTMLButtonElement>(null);
  const { pressed, pressProps } = usePress();
  return (
    <motion.li
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index, 5) * 0.035, duration: reduce ? 0 : 0.22, ease: [0.22, 1, 0.36, 1] }}
      className={cn('relative', item.archived && 'opacity-65')}
      {...pressProps}
    >
      <motion.div
        animate={{ scale: pressed ? 0.97 : 1 }}
        transition={{ duration: 0.12, ease: [0.22, 1, 0.36, 1] }}
        className={cn(
          'flex cursor-pointer items-center gap-3 rounded-sq-lg border border-surface-2 bg-surface/80 px-3 py-3',
          pressed && 'bg-surface-2/70',
        )}
      >
        <button type="button" onClick={onEdit} className="min-w-0 flex-1 text-left">
          <span className="flex items-center gap-2">
            <span className="truncate text-[15px] text-text">{item.title}</span>
            {streak > 0 && <StreakBadge count={streak} />}
          </span>
          <span className="mt-0.5 flex items-center gap-2 text-xs text-muted">
            <span className="truncate">{describeSchedule(item.schedule)}</span>
            {item.reminderTime && (
              <span className="inline-flex shrink-0 items-center gap-1">
                <Bell size={10} strokeWidth={1.75} />
                {item.reminderTime}
              </span>
            )}
          </span>
        </button>
        <button
          type="button"
          ref={menuBtnRef}
          aria-label={`Actions for ${item.title}`}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen(!menuOpen)}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:text-text"
        >
          <MoreHorizontal size={18} strokeWidth={1.75} />
        </button>
      </motion.div>

      {menuOpen && (
        <MenuPanel anchorRef={menuBtnRef} onClose={() => setMenuOpen(false)} minWidthClass="min-w-52">
          <MenuRow onSelect={onEdit} icon={<Pencil size={15} strokeWidth={1.75} />}>
            Edit
          </MenuRow>
          <MenuRow
            onSelect={onArchiveToggle}
            icon={
              item.archived ? (
                <ArchiveRestore size={15} strokeWidth={1.75} />
              ) : (
                <Archive size={15} strokeWidth={1.75} />
              )
            }
          >
            {item.archived ? 'Restore' : 'Archive'}
          </MenuRow>
          <button
            type="button"
            onClick={onDelete}
            className={cn(
              'flex min-h-11 w-full items-center gap-2.5 px-3.5 text-left text-sm transition-colors',
              confirmDelete ? 'bg-danger/15 text-danger' : 'text-danger hover:bg-surface-2',
            )}
          >
            <Trash2 size={15} strokeWidth={1.75} />
            {confirmDelete ? 'Tap again to delete' : 'Delete'}
          </button>
        </MenuPanel>
      )}
    </motion.li>
  );
}

function MenuRow({
  children,
  onSelect,
  icon,
}: {
  children: React.ReactNode;
  onSelect: () => void;
  icon?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="flex min-h-11 w-full items-center gap-2.5 px-3.5 text-left text-sm text-text transition-colors hover:bg-surface-2"
    >
      {icon}
      {children}
    </button>
  );
}

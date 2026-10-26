import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Bell, MoreHorizontal, Pencil } from 'lucide-react';
import type { CompletionStatus, Item, ISODate } from '@pulsar/shared';
import { cn } from '../lib/cn';
import { statusKind } from '../lib/missed';
import { usePress } from '../lib/usePress';
import { CheckCircle } from './CheckCircle';
import { MenuPanel } from './MenuPanel';
import { StreakBadge } from './StreakBadge';

interface ItemRowProps {
  item: Item;
  status: CompletionStatus | null | undefined;
  date: ISODate;
  today: ISODate;
  streak: number;
  index: number;
  onToggleDone: () => void;
  onSkip: () => void;
  onUnskip: () => void;
  onEdit: () => void;
}

/**
 * One due item on a day view. Tap the circle to toggle done; long-press or
 * the ⋯ menu for skip / unskip / edit. A done row briefly glows teal and
 * settles (reduced motion: plain color change).
 */
export function ItemRow({
  item,
  status,
  date,
  today,
  streak,
  index,
  onToggleDone,
  onSkip,
  onUnskip,
  onEdit,
}: ItemRowProps) {
  const reduce = useReducedMotion();
  const [menuOpen, setMenuOpen] = useState(false);
  const [pulse, setPulse] = useState(false);
  const { pressed, pressProps } = usePress();
  const prevStatus = useRef(status);
  const pressTimer = useRef<number | null>(null);
  const pressOrigin = useRef<{ x: number; y: number } | null>(null);
  const menuBtnRef = useRef<HTMLButtonElement>(null);

  const kindState = statusKind(status, date, today);
  const done = kindState === 'done';
  const skipped = kindState === 'skipped';

  // Brief teal glow whenever this row flips to done.
  useEffect(() => {
    if (status === 'done' && prevStatus.current !== 'done') {
      setPulse(true);
      const t = setTimeout(() => setPulse(false), 750);
      prevStatus.current = status;
      return () => clearTimeout(t);
    }
    prevStatus.current = status;
  }, [status]);

  // Long-press opens the same menu as ⋯.
  function startPress() {
    pressTimer.current = window.setTimeout(() => setMenuOpen(true), 480);
  }
  function cancelPress() {
    if (pressTimer.current) window.clearTimeout(pressTimer.current);
    pressTimer.current = null;
  }
  // Compose usePress's press visuals with the long-press timer on one handler
  // set. Any real finger movement cancels the long-press: rows live inside the
  // day slider's drag area, so a swipe must never open the row menu
  // mid-gesture. Same clientX/Y origin-delta logic as usePress (e.movementX is
  // unreliable for touch).
  function onPointerDown(e: ReactPointerEvent<HTMLLIElement>) {
    pressProps.onPointerDown(e);
    pressOrigin.current = { x: e.clientX, y: e.clientY };
    startPress();
  }
  function onPointerMove(e: ReactPointerEvent<HTMLLIElement>) {
    pressProps.onPointerMove(e);
    const o = pressOrigin.current;
    if (o && (Math.abs(e.clientX - o.x) > 2 || Math.abs(e.clientY - o.y) > 2)) {
      pressOrigin.current = null;
      cancelPress();
    }
  }
  function onPointerUp(e: ReactPointerEvent<HTMLLIElement>) {
    pressProps.onPointerUp(e);
    pressOrigin.current = null;
    cancelPress();
  }
  function onPointerCancel(e: ReactPointerEvent<HTMLLIElement>) {
    pressProps.onPointerCancel(e);
    pressOrigin.current = null;
    cancelPress();
  }
  function onPointerLeave(e: ReactPointerEvent<HTMLLIElement>) {
    pressProps.onPointerLeave(e);
    pressOrigin.current = null;
    cancelPress();
  }
  useEffect(() => () => cancelPress(), []);

  return (
    <motion.li
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index, 5) * 0.035, duration: reduce ? 0 : 0.22, ease: [0.22, 1, 0.36, 1] }}
      className="relative"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerLeave}
      onPointerCancel={onPointerCancel}
      onContextMenu={(e) => {
        e.preventDefault();
        cancelPress();
        setMenuOpen(true);
      }}
    >
      <motion.div
        animate={{ scale: pressed ? 0.97 : 1 }}
        transition={{ duration: 0.12, ease: [0.22, 1, 0.36, 1] }}
        className={cn(
          'flex cursor-pointer items-center gap-3 rounded-sq-lg border border-surface-2 bg-surface/80 px-3 py-2.5 transition-shadow duration-500',
          pressed && 'bg-surface-2/70',
          pulse && !reduce && 'shadow-[0_0_28px_var(--glow-teal)] ring-1 ring-accent-2/40',
          menuOpen && 'ring-1 ring-accent/40',
        )}
      >
        <CheckCircle
          kind={kindState}
          onToggle={onToggleDone}
          aria-label={done ? `Uncheck ${item.title}` : `Mark ${item.title} done`}
        />
        <button
          type="button"
          onClick={onToggleDone}
          className="min-w-0 flex-1 text-left"
          aria-label={done ? `Uncheck ${item.title}` : `Mark ${item.title} done`}
        >
          <div className="flex items-center gap-2">
            <span
              className={cn(
                'truncate text-[15px] leading-snug',
                done && (item.kind === 'todo' ? 'text-muted line-through' : 'text-text/80'),
                skipped && 'text-muted',
              )}
            >
              {item.title}
            </span>
            {item.kind === 'habit' && !skipped && <StreakBadge count={streak} />}
          </div>
          <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted">
            {skipped && <span className="text-warn/90">Skipped</span>}
            {item.reminderTime && (
              <span className="inline-flex items-center gap-1">
                <Bell size={10} strokeWidth={1.75} />
                {item.reminderTime}
              </span>
            )}
            {!skipped && !item.reminderTime && item.description && (
              <span className="truncate">{item.description}</span>
            )}
          </div>
        </button>
        <button
          type="button"
          ref={menuBtnRef}
          aria-label={`Actions for ${item.title}`}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((v) => !v)}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:text-text"
        >
          <MoreHorizontal size={18} strokeWidth={1.75} />
        </button>
      </motion.div>

      {menuOpen && (
        <MenuPanel anchorRef={menuBtnRef} onClose={() => setMenuOpen(false)} minWidthClass="min-w-48">
          {skipped ? (
            <MenuRow
              onSelect={() => {
                onUnskip();
                setMenuOpen(false);
              }}
            >
              Unskip this day
            </MenuRow>
          ) : (
            <MenuRow
              onSelect={() => {
                onSkip();
                setMenuOpen(false);
              }}
            >
              Skip this day
            </MenuRow>
          )}
          <MenuRow
            onSelect={() => {
              setMenuOpen(false);
              onEdit();
            }}
            icon={<Pencil size={15} strokeWidth={1.75} />}
          >
            Edit item
          </MenuRow>
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

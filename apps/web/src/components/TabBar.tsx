import { NavLink } from 'react-router';
import { motion, useReducedMotion } from 'framer-motion';
import { CalendarDays, ListTodo, Settings2, Sunrise } from 'lucide-react';
import { cn } from '../lib/cn';

const TABS = [
  { to: '/', label: 'Today', icon: Sunrise, end: true },
  { to: '/calendar', label: 'Calendar', icon: CalendarDays, end: false },
  { to: '/items', label: 'Items', icon: ListTodo, end: false },
  { to: '/settings', label: 'Settings', icon: Settings2, end: false },
] as const;

/**
 * Bottom tab bar on phones (safe-area aware), top rail on desktop.
 * Rendered as an in-flow flex child of the app shell (NOT position: fixed) so
 * iOS standalone can't leave a gap below it. Active tab gets an animated pill.
 *
 * Mobile: icon + label sit LOW — below them only the safe-area strip (covered
 * by this nav's own background) plus a 4px touch gap. The ≥44pt tap-target
 * slack lives at the TOP of each stretched NavLink, never under the labels.
 */
export function TabBar() {
  const reduce = useReducedMotion();
  return (
    <nav
      aria-label="Main"
      className="relative z-50 shrink-0 border-t border-surface-2 bg-surface/85 backdrop-blur-lg md:order-first md:border-t-0 md:border-b"
    >
      <div className="mx-auto flex h-[calc(3.5rem+env(safe-area-inset-bottom,0px))] max-w-3xl items-stretch gap-1 px-2 pb-[env(safe-area-inset-bottom,0px)] md:h-[calc(3.5rem+env(safe-area-inset-top,0px))] md:px-4 md:pb-0 md:pt-[env(safe-area-inset-top,0px)]">
        {TABS.map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} className="relative flex-1 md:flex-none md:min-w-32">
            {({ isActive }) => (
              <span
                className={cn(
                  'absolute inset-x-1 bottom-1 flex flex-col items-center justify-center gap-0.5 rounded-sq px-3 py-1.5 transition duration-100 active:scale-[0.9] active:bg-surface-2/70 md:top-2 md:bottom-2',
                  isActive ? 'text-text' : 'text-muted',
                )}
              >
                {isActive && (
                  <motion.span
                    layoutId={reduce ? undefined : 'tab-pill'}
                    transition={
                      reduce
                        ? { duration: 0 }
                        : { type: 'spring', stiffness: 750, damping: 45, mass: 0.5 }
                    }
                    className="absolute inset-0 rounded-sq border border-accent/25 bg-accent/12"
                    aria-hidden
                  />
                )}
                <span className="relative z-10 flex flex-col items-center gap-0.5">
                  <Icon size={21} strokeWidth={1.75} />
                  <span className="text-[10.5px] font-medium tracking-wide">{label}</span>
                </span>
              </span>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}

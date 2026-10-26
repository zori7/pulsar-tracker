import { useEffect, useRef, useState, type ReactNode, type KeyboardEvent, type PointerEvent } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { cn } from '../lib/cn';
import { usePress } from '../lib/usePress';

interface SquareToggleProps {
  active: boolean;
  onToggle: () => void;
  'aria-label': string;
  children?: ReactNode;
  /** 'round' = weekday chips, 'sq' = loop/monthday squares. */
  shape?: 'sq' | 'round';
  size?: 'sm' | 'md';
  className?: string;
  tabIndex?: number;
  onKeyDown?: (e: KeyboardEvent<HTMLButtonElement>) => void;
  dataLoopIndex?: number;
  onPointerDownCapture?: (e: PointerEvent<HTMLButtonElement>) => void;
  onPointerEnter?: (e: PointerEvent<HTMLButtonElement>) => void;
  /**
   * 'click' (default) toggles via onClick. 'none' for drag-paint squares,
   * where the parent owns pointer + keyboard toggling.
   */
  toggleOn?: 'click' | 'none';
  ref?: React.Ref<HTMLButtonElement>;
}

/**
 * The one interactive primitive behind weekday chips, monthday squares and
 * loop squares: springy fill + soft glow when active. Honors reduced motion.
 */
export function SquareToggle({
  active,
  onToggle,
  children,
  shape = 'sq',
  size = 'md',
  className,
  tabIndex,
  onKeyDown,
  'aria-label': ariaLabel,
  dataLoopIndex,
  onPointerDownCapture,
  onPointerEnter,
  toggleOn = 'click',
  ref,
}: SquareToggleProps) {
  const reduce = useReducedMotion();
  const { pressed, pressProps } = usePress();
  const [pulse, setPulse] = useState(false);
  const prevActive = useRef(active);

  // Brief scale pulse whenever this square flips on.
  useEffect(() => {
    if (active && !prevActive.current) {
      setPulse(true);
      const t = setTimeout(() => setPulse(false), 400);
      prevActive.current = active;
      return () => clearTimeout(t);
    }
    prevActive.current = active;
  }, [active]);

  const sizeCls = size === 'sm' ? 'h-9 min-w-9 text-[12px]' : 'min-h-11 min-w-11 text-[13px]';

  return (
    <motion.button
      ref={ref}
      type="button"
      role="switch"
      aria-checked={active}
      aria-label={ariaLabel}
      tabIndex={tabIndex}
      onKeyDown={onKeyDown}
      data-loop-index={dataLoopIndex}
      onPointerDownCapture={onPointerDownCapture}
      onPointerEnter={onPointerEnter}
      onClick={toggleOn === 'click' ? onToggle : undefined}
      animate={reduce ? { scale: 1 } : pulse ? { scale: [1, 1.14, 1] } : { scale: pressed ? 0.9 : 1 }}
      transition={{ type: 'spring', stiffness: 520, damping: 22, mass: 0.55 }}
      {...pressProps}
      className={cn(
        'sq flex select-none items-center justify-center font-medium',
        shape === 'round' ? 'rounded-full' : 'rounded-sq',
        active ? 'sq-on' : 'sq-rest hover:border-accent/40',
        sizeCls,
        className,
      )}
    >
      {children}
    </motion.button>
  );
}

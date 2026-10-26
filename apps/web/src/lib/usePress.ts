import { useCallback, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';

type PressEvent = ReactPointerEvent<HTMLElement>;

/**
 * Raw pointer-driven press state for touch + mouse.
 *
 * Drives press visuals from raw pointer events instead of framer's whileTap:
 * the day slider's drag="x" acquires motion's global drag lock on any finger
 * movement, so whileTap's end handler never runs when a press turns into a
 * scroll (pointercancel/pointerup arrives while the lock is held) and the row
 * stays frozen at its tapped scale. Here, moving beyond `threshold` px on
 * either axis clears the press, so a scroll always resets visuals.
 *
 * Returns `pressed` and `pressProps` to spread on the element.
 */
export function usePress(threshold = 2) {
  const [pressed, setPressed] = useState(false);
  const origin = useRef<{ x: number; y: number } | null>(null);

  const onPointerDown = useCallback((e: PressEvent) => {
    if (!e.isPrimary) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    origin.current = { x: e.clientX, y: e.clientY };
    setPressed(true);
  }, []);

  const onPointerMove = useCallback((e: PressEvent) => {
    const o = origin.current;
    if (!o) return;
    // clientX/Y deltas — e.movementX is unreliable for touch.
    if (Math.abs(e.clientX - o.x) > threshold || Math.abs(e.clientY - o.y) > threshold) {
      origin.current = null;
      setPressed(false);
    }
  }, [threshold]);

  const clear = useCallback((_e?: PressEvent) => {
    origin.current = null;
    setPressed(false);
  }, []);

  const pressProps = {
    onPointerDown,
    onPointerMove,
    onPointerUp: clear,
    onPointerCancel: clear,
    onPointerLeave: clear,
  } as const;

  return { pressed, pressProps };
}

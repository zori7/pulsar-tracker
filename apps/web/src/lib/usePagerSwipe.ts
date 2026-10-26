import { useRef, type PointerEvent as ReactPointerEvent } from 'react';
import { useDragControls, type HTMLMotionProps, type PanInfo } from 'framer-motion';

interface PagerSwipeOptions {
  /** False under reduced motion — no drag at all. */
  enabled: boolean;
  /** Pointer offset (px) that triggers a page on release. */
  distance: number;
  /** Horizontal dead-zone before the drag engages (default 20). */
  threshold?: number;
  onPrev: () => void;
  onNext: () => void;
}

/**
 * Horizontal swipe pager with a dead-zone: framer's own drag engages after
 * just 3px of ANY movement, so the slightest drift on a vertical scroll would
 * grab the gesture and slide the panel sideways. Instead the drag stays
 * unarmed until the pointer has moved `threshold` px AND is
 * horizontal-dominant; vertical-dominant gestures are abandoned entirely so
 * the list always scrolls. On arming, the CURRENT move event becomes the drag
 * origin (a later origin would snap the panel to the finger's head start).
 */
export function usePagerSwipe({
  enabled,
  distance,
  threshold = 20,
  onPrev,
  onNext,
}: PagerSwipeOptions) {
  const controls = useDragControls();
  const down = useRef<{ x: number; y: number } | null>(null);
  const armed = useRef(false);

  function reset() {
    down.current = null;
    armed.current = false;
  }

  function onPointerDown(e: ReactPointerEvent<HTMLElement>) {
    if (!enabled || !e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0)) return;
    down.current = { x: e.clientX, y: e.clientY };
    armed.current = false;
  }

  function onPointerMove(e: ReactPointerEvent<HTMLElement>) {
    const d = down.current;
    if (!d || armed.current) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (Math.abs(dx) >= threshold && Math.abs(dx) > Math.abs(dy)) {
      armed.current = true;
      controls.start(e.nativeEvent);
    } else if (Math.abs(dy) >= threshold) {
      // Clearly vertical: this gesture is a scroll, never a page-drag.
      reset();
    }
  }

  const dragProps: HTMLMotionProps<'div'> = {
    drag: enabled ? 'x' : false,
    dragControls: controls,
    dragListener: false,
    dragConstraints: { left: 0, right: 0 },
    dragElastic: 0.16,
    onDragEnd: (_event, info: PanInfo) => {
      if (info.offset.x < -distance) onNext();
      else if (info.offset.x > distance) onPrev();
      reset();
    },
    onPointerDown,
    onPointerMove,
    onPointerUp: reset,
    onPointerCancel: reset,
    onPointerLeave: reset,
  };

  return { dragProps };
}

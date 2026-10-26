import { useEffect, useLayoutEffect, useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';

/**
 * Row action menu that escapes its container. Rendered via a portal on
 * `document.body` and positioned `fixed` against the trigger button — menus
 * placed with `absolute` inside sheets/scroll regions get clipped by `overflow`
 * (e.g. the day sheet's footer painted over the todo popover), and `transform`
 * on animated ancestors re-anchors `fixed` children too.
 *
 * Anchored right-aligned below the trigger, flipping above it when there isn't
 * ~180px of room below. Closes on scroll/resize instead of tracking position.
 */
export function MenuPanel({
  anchorRef,
  onClose,
  minWidthClass = 'min-w-48',
  children,
}: {
  anchorRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  minWidthClass?: string;
  children: ReactNode;
}) {
  const [style, setStyle] = useState<{ top?: number; bottom?: number; right: number } | null>(null);

  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;
    const r = anchor.getBoundingClientRect();
    const roomBelow = window.innerHeight - r.bottom;
    setStyle({
      right: Math.max(8, Math.round(window.innerWidth - r.right)),
      ...(roomBelow > 180
        ? { top: Math.round(r.bottom + 6) }
        : { bottom: Math.round(window.innerHeight - r.top + 6) }),
    });
  }, [anchorRef]);

  useEffect(() => {
    const close = () => onClose();
    window.addEventListener('resize', close);
    window.addEventListener('scroll', close, true);
    return () => {
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [onClose]);

  if (!style) return null;

  return createPortal(
    <>
      <button
        type="button"
        aria-label="Close menu"
        className="fixed inset-0 z-[80] cursor-default"
        onClick={onClose}
      />
      <div
        className={`fixed z-[90] overflow-hidden rounded-sq-md border border-surface-2 bg-surface shadow-2xl ${minWidthClass}`}
        style={style}
      >
        {children}
      </div>
    </>,
    document.body,
  );
}

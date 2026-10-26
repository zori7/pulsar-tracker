import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Drawer } from '@base-ui/react/drawer';
import { X } from 'lucide-react';
import { cn } from '../lib/cn';
import { useDesktop } from '../lib/useDesktop';

interface SheetProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  /**
   * fullScreen — mobile route presentation: the sheet fills the screen on
   * phones and becomes a centered card on desktop. Otherwise a bottom sheet
   * on phones, centered card on desktop.
   */
  presentation?: 'sheet' | 'fullScreen';
  showClose?: boolean;
  /**
   * When false, the body is a plain flex column (no scroll / no padding) so
   * the caller can own its own scroll region + a flush, non-scrolling footer.
   * Used by the item form so its action bar sits flush at the sheet bottom.
   */
  scrollBody?: boolean;
}

/**
 * Slide-up sheet (phone) / centered modal card (desktop).
 *
 * The phone bottom sheet runs on Base UI's Drawer: its swipe-to-dismiss is
 * coordinated with the inner scroll area (the list scrolls freely; a flick
 * only dismisses from the top), it releases with finger velocity, and outside
 * presses only dismiss via the scrim — so portaled row menus keep working.
 * A hand-rolled framer `drag="y"` on the panel cannot do this: it fights the
 * scroll body and fires `onDragEnd` on every `pointercancel`, i.e. scrolling
 * up closed the sheet. Desktop cards and the full-screen route modal need no
 * gestures and keep the framer spring.
 */
export function Sheet({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  presentation = 'sheet',
  showClose = true,
  scrollBody = true,
}: SheetProps) {
  const desktop = useDesktop();
  const isCard = desktop;
  const isFull = presentation === 'fullScreen' && !desktop;

  if (!isCard && !isFull) {
    return (
      <DrawerSheet
        open={open}
        onClose={onClose}
        title={title}
        subtitle={subtitle}
        footer={footer}
        showClose={showClose}
        scrollBody={scrollBody}
      >
        {children}
      </DrawerSheet>
    );
  }
  return (
    <CardSheet
      open={open}
      onClose={onClose}
      title={title}
      subtitle={subtitle}
      footer={footer}
      isCard={isCard}
      isFull={isFull}
      showClose={showClose}
      scrollBody={scrollBody}
    >
      {children}
    </CardSheet>
  );
}

/** Phone bottom sheet — Base UI Drawer (swipe + scroll coordination). */
function DrawerSheet({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  showClose = true,
  scrollBody = true,
}: SheetProps) {
  // Base UI's slide-in rides its `transitionStatus` starting phase, which
  // arms on a closed→open change — a root that mounts already open (the item
  // form route) paints at its final position and only animates on close.
  // Drive that entrance ourselves: the popup first paints in a forced start
  // pose (`.drawer-enter`, transitions off); dropping the class one frame
  // later lets the standard transition play. Flip-opened drawers (calendar,
  // backfill) keep Base UI's own choreography — they mount closed, so
  // `entering` is false from the start.
  const [entering, setEntering] = useState(open);
  useEffect(() => {
    if (!entering) return;
    const raf = requestAnimationFrame(() => setEntering(false));
    return () => cancelAnimationFrame(raf);
  }, [entering]);
  const shown = open;

  return (
    <Drawer.Root
      open={shown}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      {/* Keyboard-aware: keeps the focused field visible above the iOS
          keyboard and publishes --drawer-keyboard-inset for footer offsets. */}
      <Drawer.VirtualKeyboardProvider>
        <Drawer.Portal>
        {/* --app-h is the TRUE visible area (the app-shell's fix for the iOS
            layout viewport): plain `fixed inset-0` stops 62pt short of the
            physical bottom on this device, leaving the sheet floating above
            an un-scrimmed strip. */}
        <Drawer.Backdrop className="drawer-scrim fixed inset-x-0 top-0 z-[60] h-[var(--app-h,100dvh)] bg-[var(--scrim)] backdrop-blur-[2px]" />
        <Drawer.Viewport className="fixed inset-x-0 top-0 z-[60] flex h-[var(--app-h,100dvh)] items-end justify-center">
          <Drawer.Popup
            aria-label={typeof title === 'string' ? title : 'Sheet'}
            className={cn(
              'drawer-panel flex max-h-[88%] min-h-0 w-full flex-col overflow-hidden rounded-t-sq-lg border border-surface-2 bg-surface shadow-2xl outline-none touch-none',
              entering && 'drawer-enter',
            )}
          >
            {(title || showClose) && (
              <header className="relative flex items-start gap-3 px-5 pt-5 pb-1 touch-none select-none">
                <div className="absolute inset-x-0 top-2 flex justify-center">
                  <div className="h-1 w-9 rounded-full bg-surface-2" aria-hidden />
                </div>
                <div className="min-w-0 flex-1">
                  {title && (
                    <Drawer.Title className="truncate text-lg font-medium text-text">
                      {title}
                    </Drawer.Title>
                  )}
                  {subtitle && (
                    <Drawer.Description className="mt-0.5 text-sm text-muted">
                      {subtitle}
                    </Drawer.Description>
                  )}
                </div>
                {showClose && (
                  <button
                    type="button"
                    onClick={onClose}
                    aria-label="Close"
                    className="-m-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:text-text"
                  >
                    <X size={20} strokeWidth={1.75} />
                  </button>
                )}
              </header>
            )}
            {scrollBody ? (
              <Drawer.Content className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain px-5 py-4 touch-auto">
                {children}
              </Drawer.Content>
            ) : (
              <div className="flex min-h-0 flex-1 flex-col overflow-x-hidden touch-auto">
                {children}
              </div>
            )}
            {footer && (
              <div className="shrink-0 border-t border-surface-2 px-5 pt-3 safe-b">
                {footer}
              </div>
            )}
            {!footer && scrollBody && (
              <div className="h-[env(safe-area-inset-bottom,0px)] shrink-0" />
            )}
          </Drawer.Popup>
        </Drawer.Viewport>
      </Drawer.Portal>
      </Drawer.VirtualKeyboardProvider>
    </Drawer.Root>
  );
}

/** Desktop card / mobile full-screen route modal — no gestures, framer spring. */
function CardSheet({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  isCard,
  isFull,
  showClose = true,
  scrollBody = true,
}: SheetProps & { isCard: boolean; isFull: boolean }) {
  const reduce = useReducedMotion();
  const panelRef = useRef<HTMLDivElement>(null);

  // Lock background scroll + Esc to close + move focus into the panel.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    panelRef.current?.focus();
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  const panelInitial = reduce
    ? { opacity: 0 }
    : isCard
      ? { opacity: 0, scale: 0.96, y: 14 }
      : { opacity: 1, y: '100%' as const };
  const panelAnimate = reduce
    ? { opacity: 1 }
    : isCard
      ? { opacity: 1, scale: 1, y: 0 }
      : { y: 0 };
  const panelExit = reduce
    ? { opacity: 0 }
    : isCard
      ? { opacity: 0, scale: 0.97, y: 10 }
      : { y: '100%' as const, opacity: 1 };

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : undefined}>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClose}
            className="absolute inset-0 bg-[var(--scrim)] backdrop-blur-[2px]"
          />
          {/* The visible panel box IS the animated element: the whole card /
              bottom sheet (border, background, shadow, rounded corners) slides
              or scales as one unit — not just its contents. */}
          <motion.div
            ref={panelRef}
            tabIndex={-1}
            initial={panelInitial}
            animate={panelAnimate}
            exit={panelExit}
            transition={{ type: 'spring', stiffness: 420, damping: 38, mass: 0.9 }}
            className={cn(
              'absolute flex flex-col overflow-hidden outline-none',
              isCard
                ? 'inset-x-4 top-[6vh] bottom-auto mx-auto max-h-[84vh] w-full max-w-lg rounded-sq-lg'
                : 'inset-0',
              'border border-surface-2 bg-surface shadow-2xl',
            )}
          >
            {(title || showClose) && (
              <header
                className={cn(
                  'relative flex items-start gap-3 px-5 pb-1',
                  // Add safe-area inset on top of a real base padding. The old
                  // `safe-t` utility *overrode* pt-5 (equal specificity, later in
                  // the cascade) → 0 top padding on desktop. calc() keeps both.
                  isFull
                    ? 'pt-[calc(1.25rem+env(safe-area-inset-top,0px))]'
                    : 'pt-5',
                )}
              >
                {!isFull && !isCard && (
                  <div className="absolute inset-x-0 top-2 flex justify-center">
                    <div className="h-1 w-9 rounded-full bg-surface-2" aria-hidden />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  {title && (
                    <h2 className="truncate text-lg font-medium text-text">{title}</h2>
                  )}
                  {subtitle && (
                    <p className="mt-0.5 text-sm text-muted">{subtitle}</p>
                  )}
                </div>
                {showClose && (
                  <button
                    type="button"
                    onClick={onClose}
                    aria-label="Close"
                    className="-m-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:text-text"
                  >
                    <X size={20} strokeWidth={1.75} />
                  </button>
                )}
              </header>
            )}
            <div
              className={
                scrollBody
                  ? 'min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain px-5 py-4'
                  : 'flex min-h-0 flex-1 flex-col overflow-x-hidden'
              }
            >
              {children}
            </div>
            {footer && (
              <div className="shrink-0 border-t border-surface-2 px-5 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]">
                {footer}
              </div>
            )}
            {!footer && isFull && scrollBody && <div className="safe-b" />}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

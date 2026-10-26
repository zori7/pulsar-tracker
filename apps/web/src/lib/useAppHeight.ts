import { useEffect } from 'react';

/**
 * Bind `--app-h` (shell height) and `--bottom-gap` (how far the layout
 * viewport's bottom sits above the physical screen bottom) to the TRUE visible
 * area.
 *
 * Measured on the user's iPhone 17 Pro (2026-10, via the on-screen diag):
 *   inner = vv = client = 812, screen = 874, env(safe-area-inset-bottom) = 34
 * i.e. the layout viewport is 62pt SHORT of the physical screen at the bottom.
 * That 62pt band is real, visible screen — it is the long-standing "extra
 * padding below the navbar": in-flow content can never reach into it.
 *
 * How the shell reaches it without re-creating the page-scroll bug: the shell
 * is `position: fixed` (see .app-shell in index.css). Fixed elements are NOT
 * part of the document's scrollable overflow, so extending the shell to the
 * physical bottom leaves nothing to scroll — unlike inflating `html`, which
 * made the whole page pannable.
 *
 * `screen.height` is only trusted in standalone (installed PWA) mode: in a
 * browser it includes window chrome / URL-bar space and would over-extend.
 * Never use `documentElement.clientHeight` — it is the value written here
 * (self-referential feedback that pins a stale pre-settle height).
 *
 * `--bottom-gap` lets `position: fixed` elements (FAB, toasts) stay anchored
 * to the physical bottom: subtract it from their `bottom` offset.
 */
export function measureAppHeight(): { height: number; bottomGap: number } {
  const vv = window.visualViewport?.height ?? 0;
  const inner = window.innerHeight || 0;
  const visible = Math.max(vv, inner);
  const standalone =
    (navigator as { standalone?: boolean }).standalone === true ||
    (typeof window.matchMedia === 'function' &&
      window.matchMedia('(display-mode: standalone)').matches);
  const screenH = standalone && typeof window.screen?.height === 'number' ? window.screen.height : 0;
  const height = Math.max(visible, screenH);
  return { height, bottomGap: Math.max(0, height - visible) };
}

export function applyAppHeight(): void {
  const root = document.documentElement;
  const { height, bottomGap } = measureAppHeight();
  if (height > 0) root.style.setProperty('--app-h', `${Math.round(height)}px`);
  if (bottomGap > 0) root.style.setProperty('--bottom-gap', `${Math.round(bottomGap)}px`);
  else root.style.removeProperty('--bottom-gap');
}

export function useAppHeight(): void {
  useEffect(() => {
    applyAppHeight();

    // Aggressive settling: iOS finalises its viewport a beat after load.
    const settleTimers: number[] = [];
    for (let ms = 100; ms <= 4000; ms += 250) settleTimers.push(window.setTimeout(applyAppHeight, ms));
    const raf = window.requestAnimationFrame(applyAppHeight);
    const vv = window.visualViewport ?? null;

    vv?.addEventListener('resize', applyAppHeight);
    vv?.addEventListener('scroll', applyAppHeight);
    window.addEventListener('resize', applyAppHeight);
    window.addEventListener('orientationchange', applyAppHeight);
    window.addEventListener('pageshow', applyAppHeight);
    document.addEventListener('visibilitychange', applyAppHeight);

    return () => {
      vv?.removeEventListener('resize', applyAppHeight);
      vv?.removeEventListener('scroll', applyAppHeight);
      window.removeEventListener('resize', applyAppHeight);
      window.removeEventListener('orientationchange', applyAppHeight);
      window.removeEventListener('pageshow', applyAppHeight);
      document.removeEventListener('visibilitychange', applyAppHeight);
      window.cancelAnimationFrame(raf);
      settleTimers.forEach((t) => window.clearTimeout(t));
    };
  }, []);
}

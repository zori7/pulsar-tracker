import { useEffect, useRef } from 'react';
import { Outlet, Route, Routes, useLocation, type Location } from 'react-router';
import { TabBar } from './components/TabBar';
import { useAppHeight } from './lib/useAppHeight';
import { TodayPage } from './routes/Today';
import { CalendarPage } from './routes/Calendar';
import { ItemsPage } from './routes/Items';
import { SettingsPage } from './routes/Settings';
import { ItemFormPage } from './routes/ItemFormPage';

/** App shell: fixed-height flex column so the tab bar can never detach from
    the bottom. Height is bound to the true visible area (`--app-h` from
    visualViewport) rather than dvh alone, which iOS standalone can resolve
    short. Content column is the scrolling region; TabBar is the last in-flow
    child (top rail on desktop). */
export function AppShell() {
  const location = useLocation();
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastPath = useRef<string | null>(null);

  // Reset the shared content column's scroll on real navigations — otherwise
  // e.g. Settings' scroll depth carries into Calendar and the month grid
  // renders scrolled out of view. Modal-over-background navigations (item
  // form) and closing them must NOT reset: the underlying page keeps its spot.
  useEffect(() => {
    const state = location.state as BackgroundState | null;
    if (state?.background) return;
    const prev = lastPath.current;
    lastPath.current = location.pathname;
    if (prev !== null && prev !== location.pathname && scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [location.pathname, location.state]);

  return (
    <div className="flex flex-col overflow-hidden app-shell">
      {/* Scrolling content region. Top inset clears the iOS status bar
          (black-translucent); desktop keeps its own top rhythm. */}
      <div ref={scrollRef} className="mx-auto min-h-0 w-full max-w-3xl flex-1 overflow-x-hidden overflow-y-auto overscroll-contain px-4 pt-[calc(1rem+env(safe-area-inset-top,0px))] pb-6 sm:px-6 md:pt-8 md:pb-10">
        <Outlet />
      </div>
      <TabBar />
    </div>
  );
}

interface BackgroundState {
  background?: Location;
}

export default function App() {
  // Keep --app-h (shell height) synced to the real visible area.
  useAppHeight();
  const location = useLocation();
  const state = location.state as BackgroundState | null;
  const background = state?.background;

  // When the item form is opened over another screen (background location),
  // render the underlying screen behind it; otherwise the form is the page.
  const itemFormOpen =
    background != null &&
    (location.pathname === '/new' || /^\/items\/[^/]+$/.test(location.pathname));

  return (
    <>
      <Routes location={background ?? location}>
        <Route element={<AppShell />}>
          <Route path="/" element={<TodayPage />} />
          <Route path="/calendar" element={<CalendarPage />} />
          <Route path="/items" element={<ItemsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/new" element={<ItemFormPage />} />
          <Route path="/items/:id" element={<ItemFormPage />} />
          <Route path="*" element={<TodayPage />} />
        </Route>
      </Routes>

      {itemFormOpen && (
        <Routes location={location}>
          <Route path="/new" element={<ItemFormPage />} />
          <Route path="/items/:id" element={<ItemFormPage />} />
        </Routes>
      )}
    </>
  );
}

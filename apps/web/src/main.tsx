import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router';
import { registerSW } from 'virtual:pwa-register';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ToastProvider } from './components/Toast';
import App from './App';
import { ApiError } from './lib/api';
import { meKey } from './lib/queries';
import './index.css';

// PWA: auto-update service worker (SPEC §7).
registerSW({ immediate: true });

// A 401 from any call means the session is gone (expired / logged out on the
// server) — flip auth state so the app falls back to the sign-in screen.
function onAuthError(err: unknown) {
  if (err instanceof ApiError && err.status === 401 && err.message === 'unauthenticated') {
    queryClient.setQueryData(meKey, null);
  }
}

const queryClient: QueryClient = new QueryClient({
  queryCache: new QueryCache({ onError: onAuthError }),
  mutationCache: new MutationCache({ onError: onAuthError }),
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: true,
      retry: (count, err) => !(err instanceof ApiError && err.status === 401) && count < 1,
    },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <BrowserRouter>
          {/* Any uncaught page error falls back to a recovery panel instead of
              a blank screen — a single page can never trap the user. */}
          <ErrorBoundary>
            <App />
          </ErrorBoundary>
        </BrowserRouter>
      </ToastProvider>
    </QueryClientProvider>
  </StrictMode>,
);

import { Component, type ErrorInfo, type ReactNode } from 'react';
import { RotateCcw } from 'lucide-react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Top-level error boundary. Any uncaught render error (e.g. a page throwing
 * during mount) unmounts the subtree into this recovery panel instead of a
 * blank screen, so a single page can never trap the user. Recovery actions
 * are full-page (guaranteed to work even if the router is unhealthy).
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Pulsar crashed:', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div
        role="alert"
        className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-bg px-6 text-center"
      >
        <div className="flex flex-col items-center gap-3">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-danger/15 text-danger">
            <svg viewBox="0 0 24 24" fill="none" className="h-7 w-7" aria-hidden>
              <path
                d="M12 8v5m0 3h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <h1 className="text-xl font-medium text-text">Something went wrong</h1>
          <p className="max-w-xs text-sm text-muted">
            This screen hit an unexpected error. Your data is safe on the server.
          </p>
        </div>
        <div className="flex flex-col items-center gap-2">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="inline-flex min-h-12 items-center gap-2 rounded-sq-md bg-accent px-6 text-sm font-medium text-white shadow-[0_6px_24px_var(--glow-accent)] transition-transform active:scale-[0.98]"
          >
            <RotateCcw size={16} strokeWidth={1.75} />
            Reload
          </button>
          <a
            href="/"
            className="inline-flex min-h-11 items-center rounded-sq-md border border-surface-2 px-6 text-sm font-medium text-muted transition-colors hover:text-text"
          >
            Go to Today
          </a>
        </div>
      </div>
    );
  }
}

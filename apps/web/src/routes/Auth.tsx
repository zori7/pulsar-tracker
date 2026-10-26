import { useState, type FormEvent } from 'react';
import { Loader2 } from 'lucide-react';
import { formatApiError, useAuthMutation } from '../lib/queries';
import { Segmented } from '../components/Segmented';
import { cn } from '../lib/cn';

type Mode = 'login' | 'signup';

/**
 * Sign in / create account. Shown in place of the app shell while signed out.
 * Fields carry proper autocomplete hints so iCloud Keychain / password
 * managers can fill the same account in Safari and the home-screen PWA (they
 * keep separate cookie jars, so each signs in once).
 */
export function AuthPage() {
  const [mode, setMode] = useState<Mode>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const login = useAuthMutation('login');
  const signup = useAuthMutation('signup');
  const mut = mode === 'login' ? login : signup;

  function submit(e: FormEvent) {
    e.preventDefault();
    if (mut.isPending) return;
    mut.mutate({ username: username.trim(), password });
  }

  const error = mut.error
    ? formatApiError(mut.error, mode === 'login' ? "Couldn't sign in." : "Couldn't create the account.")
    : null;
  const canSubmit = username.trim().length > 0 && password.length > 0 && !mut.isPending;

  return (
    <div className="flex flex-col overflow-y-auto overscroll-contain app-shell">
      <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-4 pt-[calc(1rem+env(safe-area-inset-top,0px))] pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))]">
        <header>
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-accent-2">Pulsar Tracker</p>
          <h1 className="text-[28px] leading-tight font-medium text-text">
            {mode === 'login' ? 'Welcome back' : 'Create account'}
          </h1>
        </header>

        <Segmented<Mode>
          value={mode}
          onChange={(m) => {
            setMode(m);
            login.reset();
            signup.reset();
          }}
          options={[
            { value: 'login', label: 'Sign in' },
            { value: 'signup', label: 'Sign up' },
          ]}
          layoutId="auth-mode"
          aria-label="Sign in or sign up"
        />

        <form
          onSubmit={submit}
          className="flex flex-col gap-4 rounded-sq-lg border border-surface-2 bg-surface/70 p-4"
        >
          <div>
            <label htmlFor="auth-username" className="mb-1.5 block text-xs font-medium text-muted">
              Username
            </label>
            <input
              id="auth-username"
              name="username"
              className="field"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>

          <div>
            <label htmlFor="auth-password" className="mb-1.5 block text-xs font-medium text-muted">
              Password
            </label>
            <input
              id="auth-password"
              name="password"
              type="password"
              className="field"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {mode === 'signup' && <p className="mt-1 text-xs text-muted">At least 8 characters.</p>}
          </div>

          {error && (
            <p className="text-center text-xs text-danger" role="alert">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={!canSubmit}
            className={cn(
              'inline-flex min-h-12 items-center justify-center gap-2 rounded-sq-md text-sm font-medium transition-transform active:scale-[0.98]',
              canSubmit
                ? 'bg-accent text-white shadow-[0_6px_20px_var(--glow-accent)]'
                : 'bg-surface-2 text-muted',
            )}
          >
            {mut.isPending && <Loader2 size={16} strokeWidth={1.75} className="animate-spin" />}
            {mode === 'login' ? 'Sign in' : 'Create account'}
          </button>
        </form>
      </div>
    </div>
  );
}

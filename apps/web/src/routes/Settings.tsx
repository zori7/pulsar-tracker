import { useEffect, useMemo, useState } from 'react';
import { Download, LogOut, Send, Loader2 } from 'lucide-react';
import type { Settings } from '@pulsar/shared';
import { todayISO } from '@pulsar/shared';
import {
  formatApiError,
  useItemsQuery,
  useLogout,
  useMeQuery,
  useSettingsQuery,
  useTestNotification,
  useUpdateSettings,
} from '../lib/queries';
import { useToast } from '../components/Toast';
import { Switch } from '../components/Switch';
import { cn } from '../lib/cn';

/** Settings — ntfy topic/server, notifications, digest, account, export. */
export function SettingsPage() {
  const { data, isLoading } = useSettingsQuery();
  const { data: itemsData } = useItemsQuery();
  const updateMut = useUpdateSettings();
  const testMut = useTestNotification();
  const { data: me } = useMeQuery();
  const logoutMut = useLogout();
  const { toast } = useToast();

  const [draft, setDraft] = useState<Settings | null>(null);

  useEffect(() => {
    if (data && !draft) setDraft(data.settings);
  }, [data, draft]);

  const dirty = useMemo(() => {
    if (!draft || !data) return false;
    return JSON.stringify(draft) !== JSON.stringify(data.settings);
  }, [draft, data]);

  function patch(p: Partial<Settings>) {
    setDraft((d) => (d ? { ...d, ...p } : d));
  }

  function save() {
    if (!draft) return;
    updateMut.mutate({
      ntfyTopic: draft.ntfyTopic.trim(),
      ntfyServer: draft.ntfyServer.trim(),
      notificationsEnabled: draft.notificationsEnabled,
      digestTime: draft.digestTime,
    });
  }

  function exportJson() {
    const payload = {
      exportedAt: new Date().toISOString(),
      settings: draft,
      items: itemsData?.items ?? [],
      completions: itemsData?.completions ?? [],
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pulsar-export-${todayISO()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast('Export saved.');
  }

  const testResult = testMut.data;
  const testError = testMut.error
    ? formatApiError(testMut.error, "Couldn't reach the server for the test.")
    : null;

  if (isLoading || !draft) {
    return (
      <div className="flex flex-col gap-3 sm:pt-10" aria-busy="true">
        <div className="h-9 w-32 animate-pulse rounded bg-surface-2" />
        <div className="h-40 animate-pulse rounded-sq-lg bg-surface-2/60" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 pb-4 sm:pt-10">
      <header>
        <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-accent-2">
          Instrument panel
        </p>
        <h1 className="text-[28px] leading-tight font-medium text-text">Settings</h1>
      </header>

      {/* Notifications */}
      <section className="flex flex-col gap-4 rounded-sq-lg border border-surface-2 bg-surface/70 p-4">
        <h2 className="text-xs font-medium uppercase tracking-wider text-muted">Notifications</h2>

        <label className="flex items-center justify-between gap-3">
          <span className="text-sm text-text">Push via ntfy</span>
          <Switch
            aria-label="Enable notifications"
            checked={draft.notificationsEnabled}
            onChange={(v) => patch({ notificationsEnabled: v })}
          />
        </label>

        <div>
          <label htmlFor="ntfy-topic" className="mb-1.5 block text-xs font-medium text-muted">
            Topic
          </label>
          <input
            id="ntfy-topic"
            className="field"
            value={draft.ntfyTopic}
            placeholder="pulsar-xyz123"
            onChange={(e) => patch({ ntfyTopic: e.target.value })}
          />
          <p className="mt-1 text-xs text-muted">Pick something private — it's the whole password.</p>
        </div>

        <div>
          <label htmlFor="ntfy-server" className="mb-1.5 block text-xs font-medium text-muted">
            Server
          </label>
          <input
            id="ntfy-server"
            className="field"
            value={draft.ntfyServer}
            placeholder="https://ntfy.sh"
            onChange={(e) => patch({ ntfyServer: e.target.value })}
          />
        </div>

        <div>
          <label htmlFor="digest-time" className="mb-1.5 block text-xs font-medium text-muted">
            Daily digest at
          </label>
          <input
            id="digest-time"
            type="time"
            className="field w-36 tabular-nums"
            value={draft.digestTime}
            onChange={(e) => patch({ digestTime: e.target.value })}
          />
          <p className="mt-1 text-xs text-muted">One quiet message listing everything still due.</p>
        </div>

        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={save}
            disabled={!dirty || updateMut.isPending}
            className={cn(
              'min-h-12 rounded-sq-md text-sm font-medium transition-transform active:scale-[0.98]',
              dirty
                ? 'bg-accent text-white shadow-[0_6px_20px_var(--glow-accent)]'
                : 'bg-surface-2 text-muted',
            )}
          >
            {updateMut.isPending ? 'Saving…' : dirty ? 'Save settings' : 'All saved'}
          </button>
          <button
            type="button"
            onClick={() => testMut.mutate()}
            disabled={testMut.isPending}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-sq-md border border-surface-2 text-sm font-medium text-text transition-colors hover:bg-surface-2 disabled:opacity-60"
          >
            {testMut.isPending ? (
              <Loader2 size={16} strokeWidth={1.75} className="animate-spin" />
            ) : (
              <Send size={16} strokeWidth={1.75} />
            )}
            Send test notification
          </button>
          {testResult && (
            <p
              className={cn(
                'text-center text-xs',
                testResult.ok ? 'text-accent-2' : 'text-danger',
              )}
              role="status"
            >
              {testResult.ok
                ? 'Sent — check your phone.'
                : `Couldn't send${testResult.error ? ` · ${testResult.error}` : '.'}`}
            </p>
          )}
          {testError && !testResult && (
            <p className="text-center text-xs text-danger" role="status">
              {testError}
            </p>
          )}
        </div>
      </section>

      {/* Account */}
      <section className="flex flex-col gap-4 rounded-sq-lg border border-surface-2 bg-surface/70 p-4">
        <h2 className="text-xs font-medium uppercase tracking-wider text-muted">Account</h2>
        <p className="text-sm text-text">
          Signed in as <span className="font-medium">{me?.username}</span>
        </p>
        <button
          type="button"
          onClick={() => logoutMut.mutate()}
          disabled={logoutMut.isPending}
          className="inline-flex min-h-12 items-center justify-center gap-2 rounded-sq-md border border-surface-2 text-sm font-medium text-danger transition-colors hover:bg-surface-2 disabled:opacity-60"
        >
          <LogOut size={16} strokeWidth={1.75} />
          Log out
        </button>
      </section>

      {/* Data */}
      <section className="flex flex-col gap-4 rounded-sq-lg border border-surface-2 bg-surface/70 p-4">
        <h2 className="text-xs font-medium uppercase tracking-wider text-muted">Data</h2>

        <button
          type="button"
          onClick={exportJson}
          className="inline-flex min-h-12 items-center justify-center gap-2 rounded-sq-md border border-surface-2 text-sm font-medium text-text transition-colors hover:bg-surface-2"
        >
          <Download size={16} strokeWidth={1.75} />
          Export everything as JSON
        </button>
      </section>

      <p className="pb-2 text-center text-xs text-muted">
        Pulsar Tracker · self-hosted, no cloud.
      </p>
    </div>
  );
}

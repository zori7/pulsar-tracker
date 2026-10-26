import { useEffect, useMemo, useState } from 'react';
import { Check, Copy, Download, Send, Loader2 } from 'lucide-react';
import type { Settings } from '@pulsar/shared';
import { todayISO } from '@pulsar/shared';
import { getClientId } from '../lib/api';
import {
  formatApiError,
  useItemsQuery,
  useSettingsQuery,
  useTestNotification,
  useUpdateSettings,
} from '../lib/queries';
import { useToast } from '../components/Toast';
import { Switch } from '../components/Switch';
import { cn } from '../lib/cn';

/** Settings — ntfy topic/server, notifications, digest, client id, export. */
export function SettingsPage() {
  const { data, isLoading } = useSettingsQuery();
  const { data: itemsData } = useItemsQuery();
  const updateMut = useUpdateSettings();
  const testMut = useTestNotification();
  const { toast } = useToast();

  const [draft, setDraft] = useState<Settings | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (data && !draft) setDraft(data.settings);
  }, [data, draft]);

  const dirty = useMemo(() => {
    if (!draft || !data) return false;
    return JSON.stringify(draft) !== JSON.stringify(data.settings);
  }, [draft, data]);

  // getClientId() is total (never throws), but keep it memoized so the value is
  // stable and computed once — no unguarded work on every render.
  const clientId = useMemo(() => getClientId(), []);

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

  async function copyId() {
    const ok = await copyText(clientId);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } else {
      toast('Copy failed — long-press to copy instead.');
    }
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

      {/* Data */}
      <section className="flex flex-col gap-4 rounded-sq-lg border border-surface-2 bg-surface/70 p-4">
        <h2 className="text-xs font-medium uppercase tracking-wider text-muted">Data</h2>

        <div>
          <span className="mb-1.5 block text-xs font-medium text-muted">Client id</span>
          <div className="flex items-center gap-2 rounded-sq-md border border-surface-2 bg-surface-2/50 px-3 py-2.5">
            <code className="min-w-0 flex-1 truncate font-mono text-xs text-text">{clientId}</code>
            <button
              type="button"
              onClick={copyId}
              aria-label="Copy client id"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:text-text"
            >
              {copied ? (
                <Check size={15} strokeWidth={1.75} className="text-accent-2" />
              ) : (
                <Copy size={15} strokeWidth={1.75} />
              )}
            </button>
          </div>
          <p className="mt-1 text-xs text-muted">This browser's identity. Clearing site data makes a new one.</p>
        </div>

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
        Pulsar Tracker · self-hosted, single user, no cloud.
      </p>
    </div>
  );
}

/**
 * Copy to clipboard, tolerating insecure contexts where `navigator.clipboard`
 * is undefined (e.g. plain-HTTP Tailscale). Falls back to a hidden textarea +
 * execCommand('copy'). Resolves true on success.
 */
async function copyText(text: string): Promise<boolean> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      /* fall back to execCommand below */
    }
  }
  return legacyCopy(text);
}

function legacyCopy(text: string): boolean {
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '0';
    ta.style.left = '0';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    ta.setSelectionRange(0, text.length);
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

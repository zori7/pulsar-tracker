import type {
  Completion,
  CompletionStatus,
  Item,
  ItemKind,
  Schedule,
  Settings,
} from '@pulsar/shared';

/**
 * Typed fetch client for SPEC.md §4. Every call carries the stable
 * `x-client-id` header; no auth beyond that.
 */

const CLIENT_ID_KEY = 'pulsar.client-id';

let cachedClientId: string | null = null;

/** Format 16 bytes as an RFC-4122 v4 UUID (version + variant bits set). */
function uuidFromBytes(bytes: Uint8Array): string {
  bytes[6] = (bytes[6]! & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8]! & 0x3f) | 0x80; // variant 10xx
  const p = (i: number) => bytes[i]!.toString(16).padStart(2, '0');
  return (
    `${p(0)}${p(1)}${p(2)}${p(3)}-${p(4)}${p(5)}` +
    `-${p(6)}${p(7)}-${p(8)}${p(9)}` +
    `-${p(10)}${p(11)}${p(12)}${p(13)}${p(14)}${p(15)}`
  );
}

/**
 * Produce a UUID v4 without ever throwing — the app is served over plain HTTP
 * (insecure context) where `crypto.randomUUID` is unavailable (iOS Chrome /
 * WKWebView). `crypto.getRandomValues` is *not* secure-context gated, so it
 * covers that case; Math.random is the last resort.
 */
function randomUUID(): string {
  try {
    if (typeof crypto?.randomUUID === 'function') return crypto.randomUUID();
  } catch {
    /* insecure context or blocked — fall through */
  }
  try {
    if (typeof crypto?.getRandomValues === 'function') {
      return uuidFromBytes(crypto.getRandomValues(new Uint8Array(16)));
    }
  } catch {
    /* fall through */
  }
  // Not cryptographically strong, but total. Only reached in exotic cases.
  let id = '';
  for (let i = 0; i < 32; i++) {
    id += Math.floor(Math.random() * 16).toString(16);
  }
  return `${id.slice(0, 8)}-${id.slice(8, 12)}-${id.slice(12, 16)}-${id.slice(16, 20)}-${id.slice(20)}`;
}

/**
 * The stable per-browser client id. Total (never throws): localStorage and
 * crypto access are both guarded, so any page can call this during render.
 */
export function getClientId(): string {
  if (cachedClientId) return cachedClientId;
  let id: string | null = null;
  try {
    id = localStorage.getItem(CLIENT_ID_KEY);
  } catch {
    /* storage blocked (private mode) — generate a fresh id below */
  }
  if (!id) {
    id = randomUUID();
    try {
      localStorage.setItem(CLIENT_ID_KEY, id);
    } catch {
      /* can't persist — cached in memory for this session */
    }
  }
  cachedClientId = id;
  return id;
}

export class ApiError extends Error {
  readonly status: number;
  readonly details: string[];

  constructor(status: number, message: string, details: string[] = []) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set('x-client-id', getClientId());
  if (init?.body) headers.set('content-type', 'application/json');

  let res: Response;
  try {
    res = await fetch(`/api${path}`, { ...init, headers });
  } catch {
    throw new ApiError(0, 'network-error', ["Couldn't reach the server."]);
  }

  if (res.status === 204) return undefined as T;

  let body: unknown = null;
  const text = await res.text();
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }
  }

  if (!res.ok) {
    const err = body as { error?: string; details?: string[] } | null;
    throw new ApiError(res.status, err?.error ?? `http-${res.status}`, err?.details ?? []);
  }
  return body as T;
}

/* ------------------------------------------------ items + completions */

export interface ItemsResponse {
  items: Item[];
  completions: Completion[];
}

export function fetchItems(since?: string, until?: string): Promise<ItemsResponse> {
  const params = new URLSearchParams();
  if (since) params.set('since', since);
  if (until) params.set('until', until);
  const qs = params.toString();
  return apiFetch<ItemsResponse>(`/items${qs ? `?${qs}` : ''}`);
}

export interface CreateItemBody {
  kind: ItemKind;
  title: string;
  description?: string | null;
  schedule: Schedule;
  reminderTime?: string | null;
  archived?: boolean;
}

export function createItem(body: CreateItemBody): Promise<{ item: Item }> {
  return apiFetch<{ item: Item }>('/items', { method: 'POST', body: JSON.stringify(body) });
}

export function updateItem(
  id: string,
  body: Partial<Omit<CreateItemBody, 'kind'>> & { kind?: ItemKind },
): Promise<{ item: Item }> {
  return apiFetch<{ item: Item }>(`/items/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
}

export function deleteItem(id: string): Promise<void> {
  return apiFetch<void>(`/items/${id}`, { method: 'DELETE' });
}

export function putCompletion(
  itemId: string,
  date: string,
  status: CompletionStatus,
): Promise<{ completion: Completion }> {
  return apiFetch<{ completion: Completion }>(`/items/${itemId}/completions/${date}`, {
    method: 'PUT',
    body: JSON.stringify({ status }),
  });
}

export function deleteCompletion(itemId: string, date: string): Promise<void> {
  return apiFetch<void>(`/items/${itemId}/completions/${date}`, { method: 'DELETE' });
}

/* ------------------------------------------------------------- settings */

export function fetchSettings(): Promise<{ settings: Settings }> {
  return apiFetch<{ settings: Settings }>('/settings');
}

export function updateSettings(body: Partial<Settings>): Promise<{ settings: Settings }> {
  return apiFetch<{ settings: Settings }>('/settings', {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

/* --------------------------------------------------------- notifications */

export interface TestNotificationResult {
  sent: boolean;
  ok: boolean;
  error?: string;
}

export function postTestNotification(): Promise<TestNotificationResult> {
  return apiFetch<TestNotificationResult>('/notifications/test', { method: 'POST' });
}

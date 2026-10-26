import type {
  Completion,
  CompletionStatus,
  Item,
  ItemKind,
  Schedule,
  Settings,
  User,
} from '@pulsar/shared';

/**
 * Typed fetch client for SPEC.md §4. Auth is an HttpOnly session cookie set by
 * /api/auth/*; the browser attaches it to every same-origin call.
 */

/** Pre-accounts per-browser id. Only read now, to claim its data at signup. */
const LEGACY_CLIENT_ID_KEY = 'pulsar.client-id';

function readLegacyClientId(): string | null {
  try {
    return localStorage.getItem(LEGACY_CLIENT_ID_KEY);
  } catch {
    return null;
  }
}

function forgetLegacyClientId(): void {
  try {
    localStorage.removeItem(LEGACY_CLIENT_ID_KEY);
  } catch {
    /* storage blocked — nothing to forget */
  }
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

/* ----------------------------------------------------------------- auth */

export interface Credentials {
  username: string;
  password: string;
}

/** Current user, or null when signed out (401). */
export async function fetchMe(): Promise<User | null> {
  try {
    return (await apiFetch<{ user: User }>('/auth/me')).user;
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) return null;
    throw err;
  }
}

export async function signup(creds: Credentials): Promise<User> {
  const legacyId = readLegacyClientId();
  const { user } = await apiFetch<{ user: User }>('/auth/signup', {
    method: 'POST',
    body: JSON.stringify(creds),
    headers: legacyId ? { 'x-client-id': legacyId } : undefined,
  });
  forgetLegacyClientId();
  return user;
}

export async function login(creds: Credentials): Promise<User> {
  return (await apiFetch<{ user: User }>('/auth/login', { method: 'POST', body: JSON.stringify(creds) })).user;
}

export function logout(): Promise<void> {
  return apiFetch<void>('/auth/logout', { method: 'POST' });
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

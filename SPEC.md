# Pulsar Tracker — build spec (v1)

A self-hosted PWA loop habit tracker + one-time todos. **Username + password accounts**
with an HttpOnly session cookie, so the same data is reachable from Safari and the
home-screen PWA (which keep separate cookie jars — each signs in once). All data is
scoped to the user id (stored in the `client_id` columns).

Runtime context: one PC running 24/7 behind Tailscale, opened from a phone. Plain HTTP
is acceptable. Notifications go to **ntfy** (HTTP API by default, CLI script optional).

## 1. Repo layout (npm workspaces monorepo)

```
package.json                 # workspaces: apps/*, packages/*  (root scripts below)
tsconfig.base.json
SPEC.md                      # this file (contract — do not diverge)
DESIGN.md                    # design brief (designer owns final visual decisions)
docker-compose.yml           # web(nginx) + api(node) + redis
.env.example
packages/shared/             # domain model + schedule engine (owner: orchestrator)
apps/api/                    # express + sqlite + bullmq + ntfy   (owner: backend lane)
apps/web/                    # react PWA                          (owner: design lane)
```

Root scripts: `build` (builds shared → api → web), `test`, `dev` (api + web dev).

Stack:
- **shared**: TypeScript, zero runtime deps, ESM, built with `tsc`, vitest tests.
- **api**: Node 22/24 ESM, Express 5, better-sqlite3, BullMQ + Redis, zod.
- **web**: Vite + React 19 + TypeScript, React Router 7 (declarative mode),
  TanStack Query v5, Tailwind v4, framer-motion, vite-plugin-pwa.

## 2. Domain model (from `@pulsar/shared`)

```ts
type ISODate = string;   // 'YYYY-MM-DD' — calendar date, no timezone math in the app
type HHMM    = string;   // 'HH:MM' 24h, local time of the device/server
type Weekday = 0|1|2|3|4|5|6;  // 0 = Sunday

type Schedule =
  | { type: 'once';      date: ISODate }
  | { type: 'weekdays';  weekdays: Weekday[] }              // non-empty
  | { type: 'monthdays'; monthdays: number[] }              // 1..31, non-empty
  | { type: 'interval';  every: number; anchor: ISODate }   // every >= 1
  | { type: 'cycle';     length: number; pattern: boolean[]; anchor: ISODate };

type ItemKind = 'habit' | 'todo';
type CompletionStatus = 'done' | 'skipped';

interface Item {
  id: string; clientId: string; kind: ItemKind;
  title: string; description: string | null;
  schedule: Schedule;
  reminderTime: HHMM | null;     // per-item ntfy reminder
  archived: boolean;
  createdAt: string; updatedAt: string;  // ISO datetimes
}

interface Completion { itemId: string; date: ISODate; status: CompletionStatus; updatedAt: string }

interface Settings {
  clientId: string;
  ntfyTopic: string;             // editable from the PWA
  ntfyServer: string;            // default 'https://ntfy.sh' (self-hosted ntfy allowed)
  notificationsEnabled: boolean;
  digestTime: HHMM;              // daily digest of what's due today; default '09:00'
}
```

### Schedule semantics (authoritative)

`isDue(schedule, date)` — pure, used by both the web app (previews, today list) and the
API (reminders):

- `once` — due only on `date === schedule.date`.
- `weekdays` — due when `weekdayOf(date)` ∈ `weekdays` (0 = Sunday).
- `monthdays` — due when the day-of-month ∈ `monthdays`. Days that don't exist in a
  given month (e.g. 31 in February) are simply never due — no clamping.
- `interval` — due when `daysSince(anchor) % every === 0` and `date >= anchor`.
  Anchor date itself is due (day 0).
- `cycle` — the **loop pattern**. `pattern.length === length`; due when
  `pattern[daysSince(anchor) % length] === true` and `date >= anchor`. Anchor is
  `pattern[0]`. `length` ∈ 1..31. Any fill is allowed (N-on/M-off is a special case).

Validation (`validateSchedule` returns error strings): `todo` items must use `once`;
`weekdays` non-empty; `monthdays` values 1..31; `interval.every` integer ≥ 1;
`cycle.pattern.length === length`, `length` 1..31 (warn-level if all-false).

Completion semantics:
- `done` — counts toward streaks.
- `skipped` — neutral: does not count, does not break a streak.
- A past due date with **no** completion breaks the current streak. Today being due and
  unmarked is still *pending* and does not break anything.

`currentStreak(item, completions, today)` walks due dates backwards (cap 730 days).
`bestStreak(item, completions, today)` is the longest run of `done` due dates.
Non-due days are transparent for both.

## 3. Persistence (SQLite, `better-sqlite3`, WAL mode)

```sql
items(id TEXT PRIMARY KEY, client_id TEXT NOT NULL, kind TEXT NOT NULL, title TEXT NOT NULL,
      description TEXT, schedule TEXT NOT NULL,        -- JSON of Schedule
      reminder_time TEXT, archived INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
completions(item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
            date TEXT NOT NULL, status TEXT NOT NULL, updated_at TEXT NOT NULL,
            PRIMARY KEY(item_id, date));
settings(client_id TEXT PRIMARY KEY, ntfy_topic TEXT NOT NULL, ntfy_server TEXT NOT NULL,
         notifications_enabled INTEGER NOT NULL DEFAULT 1, digest_time TEXT NOT NULL,
         updated_at TEXT NOT NULL);
sent_notifications(id INTEGER PRIMARY KEY AUTOINCREMENT, client_id TEXT NOT NULL,
                   item_id TEXT, date TEXT NOT NULL, kind TEXT NOT NULL,   -- 'item'|'digest'
                   created_at TEXT NOT NULL,
                   UNIQUE(client_id, item_id, date, kind));                -- dedupe
users(id TEXT PRIMARY KEY,                       -- = client_id in the tables above
      username TEXT NOT NULL UNIQUE COLLATE NOCASE, password_hash TEXT NOT NULL,  -- scrypt
      created_at TEXT NOT NULL);
sessions(token_hash TEXT PRIMARY KEY,            -- sha256 of the cookie token
         user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
         created_at TEXT NOT NULL, expires_at TEXT NOT NULL);  -- 400 days, sliding
```

DB file: `DATABASE_PATH` (default `./data/pulsar.db`), volume-mounted in compose.

## 4. HTTP API (`/api/*`, JSON)

Every request needs a valid `pulsar_session` cookie (HttpOnly, SameSite=Lax,
Path=/api, Secure only over HTTPS). Missing/expired → `401` `{ error: 'unauthenticated' }`.
Open routes: `GET /api/health` (liveness for Docker/probes) and `POST /api/auth/{signup,
login,logout}`. Unknown item → `404`. Validation failure → `400`
`{ error: 'validation', details: string[] }`.

```
POST   /api/auth/signup                  → 201 { user } + cookie   (body: {username,password})
       # username 3–32 [A-Za-z0-9_.-], case-insensitive unique (409 username-taken);
       # password ≥ 8. A legacy `x-client-id` header claims that pre-accounts browser's
       # data as the new user's id (only if it has data and no account owns it).
POST   /api/auth/login                   → { user } + cookie | 401 invalid-credentials
POST   /api/auth/logout                  → 204, deletes this session only
GET    /api/auth/me                      → { user } | 401 unauthenticated
GET    /api/health                       → { ok: true }
GET    /api/items                        → { items: Item[], completions: Completion[] }
       # completions cover [today-365, today+60]; ?since= & ?until= (YYYY-MM-DD) override
POST   /api/items                        → 201 { item: Item }    (body: {kind,title,description?,schedule,reminderTime?,archived?})
GET    /api/items/:id                    → { item: Item }
PATCH  /api/items/:id                    → { item: Item }        (partial: title, description, schedule, reminderTime, archived)
DELETE /api/items/:id                    → 204
PUT    /api/items/:id/completions/:date  → { completion: Completion }   (body {status:'done'|'skipped'})
       # :date may be ANY calendar date — past (backfill) or future (pre-skip). No range checks.
DELETE /api/items/:id/completions/:date  → 204
GET    /api/settings                     → { settings: Settings }   (auto-creates defaults on first call)
PUT    /api/settings                     → { settings: Settings }   (partial allowed)
POST   /api/notifications/test           → 202 { sent: boolean, ok: boolean, error?: string }
```

Validation of bodies with **zod**, mirroring `validateSchedule`. Timestamps are ISO
datetimes in UTC; `date` fields are `YYYY-MM-DD`.

## 5. Notifications (ntfy)

Delivery modes (env `NTFY_MODE`):
- `http` (default): `POST {NTFY_SERVER}/{topic}` with headers `Title`, `Tags`, `Priority`,
  body = plain-text message. `NTFY_SERVER` default `https://ntfy.sh`.
- `cli`: spawn `ntfy publish --title "..." --tags ... <topic>` (binary path via
  `NTFY_BIN`, default `ntfy`) — for the host-installed script.

The topic used is the **client's** `settings.ntfyTopic` (editable in the PWA). The PWA
offers "Send test notification".

**Deep links** (env `APP_URL`, e.g. `http://homebox:8700`; default in compose). Every
message carries an ntfy `Click` action (`Click` header / `--click=<url>`) so tapping the
notification opens the app at the right place:
- item reminder and digest → `/?date=<today>` — the Today list for that day (no item
  sheet; a stray `?item=` from older links is ignored);
- test notification → `/`.

With `APP_URL` empty the messages are sent without a click action. Note that on iOS the tap
opens the URL in the browser (a plain-HTTP PWA cannot be launched via universal links) —
the page is the same app.

BullMQ (Redis, `REDIS_URL` default `redis://localhost:6379`) runs a repeatable `tick`
job every minute **in the same process as Express**:
1. For each client with `notifications_enabled`:
2. `item` reminders: items due *today*, not archived, `reminderTime` equal to the current
   `HH:MM` (server local time, `TZ` respected) and not already recorded in
   `sent_notifications` for (client, item, today, 'item') → one ntfy message per item:
   "⏰ <title> is due today" (+ optional description line).
3. `digest` reminder: current `HH:MM` equals `digest_time`, at least one due item today is
   still **unmarked** (`done` and `skipped` both count as handled — a pre-skipped day must
   not nag), not already sent for (client, NULL, today, 'digest') → single message listing
   all due items with markers: ☑ done, ⊘ skipped, ☐ still to do.
4. Failures are logged and recorded; the worker never crashes the API. If Redis is
   unreachable the API still serves requests and BullMQ reconnects.

## 6. Web app

Routes (React Router 7, declarative):
- `/` **Today** — the core screen. Date header with prev/next day arrows, week strip
  (7 days, swipe/scroll, shows past & future), list of items due on the **selected day**
  grouped Habits / Todos, tap to toggle `done`, long-press or menu for `skip`/`unskip`.
  Streak badge on habits. Quick-add FAB. Selecting a past day switches the header to
  "Backfill · Tue, Oct 20" and the same check-off interactions apply.
  Deep-link query params (notification taps): `?date=YYYY-MM-DD` selects that day;
  `?item=<id>` additionally opens that item's sheet over Today (the param is stripped
  from the history entry, so closing the sheet lands on a clean Today).
- `/calendar` — month grid (swipe/arrow across months, future & past both allowed); each
  day shows dots for due items and completion fill. Tapping a day opens that day's list
  (same component as Today).

### Backfill (filling missed days) — required

Missed days must be one tap away, never a chore:
1. **Missed banner** on `/` when any past due day in the last 14 days is unmarked:
   "3 missed check-ins" → opens the Backfill sheet (dismissible for the day; recalculated
   on load).
2. **Backfill sheet**: a scrollable list of missed occurrences, newest first —
   `date · item title` rows with `Done` / `Skip` buttons and optimistic updates, plus
   "Mark all done" bulk action. Rows leave with an exit animation as they are resolved.
3. **Calendar**: past days with missed due items render with a warning dot; the day view
   then offers the same Done/Skip actions.
4. Everything works for **future** dates too (pre-skip a vacation day, pre-mark a one-time
   todo done): no date is read-only — past, today, future are all editable with identical
   interactions.
5. Adding/editing an item may use any anchor/one-time date in the past or future (e.g. a
   habit anchored last Monday with the loop phase kept). Schedule edits are global: they
   re-evaluate all dates (documented in the UI as "applies to past days too").
- `/settings` — ntfy topic + server, notifications on/off, digest time, "Send test
  notification", account (username + log out), data export (JSON dump) + item management link.
- `/items` — all items (incl. archived), edit/delete, per-item reminder time.
- Item create/edit: full-screen route on mobile (`/new`, `/items/:id`), modal sheet on
  desktop — same form component either way. Animated with framer-motion.

Interaction requirements:
- Auth: signed out → sign-in / sign-up screen in place of the shell (autocomplete
  `username` / `current-password` / `new-password` for password managers). Any `401
  unauthenticated` flips back to it. A leftover `localStorage['pulsar.client-id']` from
  pre-accounts versions is sent once at signup to keep that data, then removed.
- Completion toggles are **optimistic** (TanStack Query cache update + rollback).
- Everything must work on a 390px-wide phone in one hand: bottom tab bar, large tap
  targets (≥ 44px), safe-area insets respected.

### The schedule selector (must feel special)

One `ScheduleEditor` component with a segmented type switch (One-time / Weekdays /
Day of month / Every X days / Loop), animated layout transitions between panels:
- **One-time**: date picker + friendly next-occurrence preview.
- **Weekdays**: seven round toggle chips (S M T W T F S) with spring press states;
  presets: "Every day", "Weekdays", "Weekends".
- **Day of month**: 1..31 grid of small toggle squares (same square language as the loop
  editor), preset "1st & 15th".
- **Every X days**: numeric stepper/slider (1..60) + start-date (anchor) picker; live
  preview of the next occurrences as small squares/chips.
- **Loop (custom pattern)** — the signature control:
  1. Pick loop length `L` (1..31) with a stepper/slider ("length of one loop").
  2. A strip of `L` rounded squares is rendered (wraps on mobile), each tappable to toggle
     "active" vs "rest". Fill state animates with a spring + subtle glow on active.
  3. Drag-to-paint: pressing and dragging across squares sets them all to the drag's
     target state (pointer events, works with touch).
  4. Presets derived from N-on/M-off: "2 on / 3 off", "3 on / 5 off", "Alternate days" —
     these set length and fill accordingly (so N-on/M-off is one tap).
  5. Below: a live preview of the next ~4 weeks (mini month strip) with active days lit,
     anchored at the chosen start date, and a plain-language summary
     ("2 days on, 3 days rest · 5-day loop").
  Everything in this control must also be keyboard accessible (arrow keys + space).

## 7. PWA

- `vite-plugin-pwa` (autoUpdate), web manifest: name "Pulsar Tracker", short_name
  "Pulsar", standalone display, theme/background colors matching the design tokens,
  maskable + any icons (SVG is acceptable if PNGs are generated from it).
- App-shell precache; API calls are network-first (never cache `/api/*` in the SW).
- Installable from the phone browser (Tailscale HTTP is fine).

## 8. Docker

`docker-compose.yml` (provided) with three services:
- `api`: `apps/api/Dockerfile` — node:22-bookworm-slim, `npm ci` workspaces, build
  shared+api, `node dist/server.js`. Env: `PORT=3000`, `DATABASE_PATH=/data/pulsar.db`,
  `REDIS_URL=redis://redis:6379`, `NTFY_MODE`, `NTFY_SERVER`, `NTFY_DEFAULT_TOPIC`, `TZ`.
  Volume `./data:/data`.
- `web`: `apps/web/Dockerfile` — multi-stage (node build → nginx:alpine), serves the
  built SPA on :80 and proxies `/api/` → `http://api:3000/api/` (incl. SPA fallback
  `try_files ... /index.html`). Published as `8700:80` (self-hosted band, see
  `~/Projects/PORTS.md`).
- `redis`: `redis:7-alpine`, no host ports.

Both Dockerfiles must build from the **repo root** context (`docker compose build` runs
from the root), so they copy the root manifests + `packages/shared` + their app.

## 9. Validation (owner in brackets)

- `npm test` — shared schedule/streak tests [orchestrator]
- `npm run build` — shared + api + web compile [each lane: at least its own workspace]
- `docker compose config` then `docker compose build` [orchestrator at reconcile]
- Manual smoke: create each schedule type, toggle completions, check the streak math,
  `POST /api/notifications/test` against a real topic [orchestrator]

## Out of scope for v1

Auth, multi-device sync conflicts beyond last-write-wins, recurring *todos*, push via Web
Push API, theming beyond light/dark, i18n (English only), data import.

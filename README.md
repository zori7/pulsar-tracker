# Pulsar Tracker

Self-hosted PWA loop habit tracker + one-time todos. Simple username + password accounts
(session cookie), so Safari and the home-screen PWA share the same data. Notifications go to [ntfy](https://ntfy.sh)
(topic editable in the app).

- Schedules: one-time todos, weekdays, days of month, every X days, and a **custom loop
  pattern** (e.g. 2 days on / 3 days rest) edited with fillable squares.
- Mobile-first PWA with motion; runs fine over plain HTTP on a Tailscale network.

See `SPEC.md` for the full contract and `DESIGN.md` for the visual brief.

## Run

```bash
npm install
npm test
npm run build

cp .env.example .env      # set TZ (your local zone) + NTFY_* values
docker compose up -d --build
# open http://homebox:8700   (your Tailscale MagicDNS name)
```

Ports: self-hosted apps on this machine use the **8700–8799** band (see
`~/Projects/PORTS.md`); Pulsar Tracker publishes **8700**. Change it in
`docker-compose.yml` (`web` service) if that slot is ever taken.

Notes:
- **Set `TZ` in `.env` to your local timezone.** Reminders and the daily digest fire
  at *server-local* times (`reminderTime`, `digestTime`), so a wrong `TZ` shifts them.
- Data lives in `./data/pulsar.db` (SQLite, created on first boot). Full reset:
  `docker compose down && rm -rf data/*`.
- SELinux hosts (Fedora/RHEL): the compose file already relabels `./data` (`:Z`) —
  no `chcon` needed.

Dev without Docker: `npm run dev:api` (port 3000) and `npm run dev:web` (port 5173,
proxies /api to :3000). Redis must be reachable for the reminder worker
(`redis-server` locally or `docker compose up redis`).

## Layout

| Path               | What                                        |
| ------------------ | ------------------------------------------- |
| `packages/shared`  | domain model + schedule/streak engine       |
| `apps/api`         | Express + SQLite + BullMQ reminders + ntfy  |
| `apps/web`         | React PWA (Vite, Tailwind, TanStack Query)  |

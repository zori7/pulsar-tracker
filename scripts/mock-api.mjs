// Dev mock of SPEC §4 for frontend iteration (Vite proxies /api -> :3000).
// In-memory: state resets on restart. Not a substitute for the real API —
// `npm run dev:api` runs that. Auth is faked: any username/password signs in
// (a flag, not a cookie — one shared session for the whole mock).
//
// Seed is computed relative to "today" at boot: a deep set of items due
// YESTERDAY (to exercise day-list scrolling / backfill), plus a full mix for
// the Items page (schedule types, reminders, archived, past + future todos).
import http from 'node:http';

const now = new Date().toISOString();
const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = iso(new Date());
const addDays = (date, n) => {
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
};
const dayOfMonth = (date) => Number(date.split('-')[2]);
const weekdayOf = (date) => {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
};

const yesterday = addDays(today, -1);
const ago = (n) => addDays(today, -n);
const ahead = (n) => addDays(today, n);

const clientId = 'mock-client-0000-1111';
let signedInAs = 'mock';
let nextId = 100;
const mk = (kind, title, schedule, extra = {}) => ({
  id: `m${nextId++}`,
  clientId,
  kind,
  title,
  description: null,
  schedule,
  reminderTime: null,
  archived: false,
  createdAt: now,
  updatedAt: now,
  ...extra,
});

const items = [
  // ---- original fixtures (kept: their history drives the dot/heatmap look)
  { id: 'h1', clientId, kind: 'habit', title: 'Morning stretch', description: 'Ten minutes, easy', schedule: { type: 'cycle', length: 5, pattern: [true, true, false, false, false], anchor: ago(12) }, reminderTime: '07:30', archived: false, createdAt: now, updatedAt: now },
  { id: 'h2', clientId, kind: 'habit', title: 'Read', description: null, schedule: { type: 'weekdays', weekdays: [0, 1, 2, 3, 4, 5, 6] }, reminderTime: null, archived: false, createdAt: now, updatedAt: now },
  { id: 'h3', clientId, kind: 'habit', title: 'Duolingo', description: null, schedule: { type: 'monthdays', monthdays: [1, 15] }, reminderTime: '20:00', archived: false, createdAt: now, updatedAt: now },
  { id: 't1', clientId, kind: 'todo', title: 'Renew passport', description: null, schedule: { type: 'once', date: ahead(3) }, reminderTime: null, archived: false, createdAt: now, updatedAt: now },
  { id: 't2', clientId, kind: 'todo', title: 'Water the ferns', description: null, schedule: { type: 'once', date: ago(2) }, reminderTime: null, archived: false, createdAt: now, updatedAt: now },
  { id: 'h4', clientId, kind: 'habit', title: 'Cold shower', description: null, schedule: { type: 'interval', every: 2, anchor: ago(40) }, reminderTime: null, archived: true, createdAt: now, updatedAt: now },

  // ---- habits: every common schedule type, spread across past/future.
  // Schedules tagged "due yesterday" include weekdayOf(yesterday) or anchor at
  // yesterday, so the deep yesterday list holds no matter which day this boots.
  mk('habit', 'Drink water', { type: 'weekdays', weekdays: [0, 1, 2, 3, 4, 5, 6] }, { reminderTime: '09:00', description: 'Two liters' }),
  mk('habit', 'Push-ups', { type: 'interval', every: 2, anchor: yesterday }), // due yesterday
  mk('habit', 'Journal', { type: 'monthdays', monthdays: [dayOfMonth(yesterday)] }, { description: 'One page, stream of thought' }), // due yesterday
  mk('habit', 'Piano practice', { type: 'cycle', length: 4, pattern: [true, false, true, false], anchor: yesterday }, { reminderTime: '19:30' }), // due yesterday
  mk('habit', 'Walk 8k steps', { type: 'weekdays', weekdays: [...new Set([1, 2, 3, 4, 5, weekdayOf(yesterday)])] }), // due yesterday
  mk('habit', 'Vitamins', { type: 'weekdays', weekdays: [0, 1, 2, 3, 4, 5, 6] }, { reminderTime: '08:00' }), // due yesterday
  mk('habit', 'Call parents', { type: 'weekdays', weekdays: [0, 6] }, { reminderTime: '11:00' }),
  mk('habit', 'Swim', { type: 'interval', every: 3, anchor: ago(9) }, { description: '20 laps' }),
  mk('habit', 'Meditate', { type: 'cycle', length: 5, pattern: [true, true, true, false, false], anchor: ago(20) }, { reminderTime: '07:00' }),
  mk('habit', 'Yoga', { type: 'monthdays', monthdays: [1, 15] }),
  mk('habit', 'No-spend day', { type: 'weekdays', weekdays: [...new Set([1, 3, 5, weekdayOf(yesterday)])] }), // due yesterday
  mk('habit', 'Swim (old plan)', { type: 'interval', every: 7, anchor: ago(60) }, { archived: true }),

  // ---- todos: yesterday batch (the scrolling case) + past + future
  mk('todo', 'Pay the electricity bill', { type: 'once', date: yesterday }, { reminderTime: '10:00' }),
  mk('todo', 'Return library books', { type: 'once', date: yesterday }),
  mk('todo', 'Email the plumber', { type: 'once', date: yesterday }, { description: 'Ask about the kitchen tap' }),
  mk('todo', 'Cancel free trial', { type: 'once', date: yesterday }, { reminderTime: '18:00' }),
  mk('todo', 'Buy coffee filters', { type: 'once', date: yesterday }),
  mk('todo', 'Reply to landlord', { type: 'once', date: yesterday }),
  mk('todo', 'Drop off recycling', { type: 'once', date: yesterday }),
  mk('todo', 'Fix bike light', { type: 'once', date: yesterday }),
  mk('todo', 'Cancel old insurance', { type: 'once', date: ago(5) }),
  mk('todo', 'Dentist appointment', { type: 'once', date: ahead(2) }, { reminderTime: '14:30' }),
  mk('todo', 'File taxes', { type: 'once', date: ahead(7) }, { reminderTime: '10:00', description: 'Receipts are in the drawer' }),
  mk('todo', 'Ship birthday gift', { type: 'once', date: ahead(5) }),
  mk('todo', 'Renew gym pass', { type: 'once', date: ahead(12) }),
];

const completions = [];
const put = (itemId, date, status) => completions.push({ itemId, date, status, updatedAt: now });

// Original history: h1 loop + h2 daily streak with deliberate gaps
for (let i = 1; i <= 12; i++) {
  const date = ago(i);
  const idx = i % 5;
  const pattern = [true, true, false, false, false];
  if (pattern[idx] && i !== 4 && i !== 9) put('h1', date, 'done');
  if (pattern[idx] && i === 7) put('h1', date, 'skipped');
}
for (let i = 1; i <= 14; i++) {
  const date = ago(i);
  if (i !== 5 && i !== 6 && i !== 11) put('h2', date, 'done');
}
put('h3', ago(13), 'done');
put('t2', ago(2), 'done');

// Yesterday: a realistic mix of done / skipped / pending so the list has
// status variety. Lookups are by title so seed edits can't desync ids.
const byTitle = (t) => items.find((i) => i.title === t);
put(byTitle('Drink water').id, yesterday, 'done');
put(byTitle('Vitamins').id, yesterday, 'done');
put(byTitle('Pay the electricity bill').id, yesterday, 'done');
put(byTitle('Cancel free trial').id, yesterday, 'done');
put(byTitle('Reply to landlord').id, yesterday, 'done');
put(byTitle('Push-ups').id, yesterday, 'skipped');
put('h1', yesterday, 'done');
put('h2', yesterday, 'done');
// Streaks for the daily habits so the week strip has dots to show
for (const title of ['Drink water', 'Vitamins', 'Walk 8k steps']) {
  const item = byTitle(title);
  for (const d of [1, 2, 3, 5, 6, 8, 9, 10, 12]) {
    if ((d + title.length) % 4 !== 0) put(item.id, ago(d), 'done');
  }
}

let settings = {
  clientId,
  ntfyTopic: 'pulsar-abc123',
  ntfyServer: 'https://ntfy.sh',
  notificationsEnabled: true,
  digestTime: '09:00',
};

const json = (res, code, body) => {
  res.writeHead(code, { 'content-type': 'application/json' });
  res.end(body === undefined ? '' : JSON.stringify(body));
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const path = url.pathname;
  if (path === '/api/health') return json(res, 200, { ok: true });
  if ((path === '/api/auth/login' || path === '/api/auth/signup') && req.method === 'POST') {
    let body = '';
    for await (const chunk of req) body += chunk;
    signedInAs = JSON.parse(body || '{}').username || 'mock';
    return json(res, path.endsWith('signup') ? 201 : 200, { user: { id: clientId, username: signedInAs } });
  }
  if (path === '/api/auth/logout' && req.method === 'POST') {
    signedInAs = null;
    return json(res, 204);
  }
  if (!signedInAs) return json(res, 401, { error: 'unauthenticated' });
  if (path === '/api/auth/me') return json(res, 200, { user: { id: clientId, username: signedInAs } });
  if (path === '/api/items' && req.method === 'GET') return json(res, 200, { items, completions });
  if (path === '/api/settings' && req.method === 'GET') return json(res, 200, { settings });
  if (path === '/api/settings' && req.method === 'PUT') {
    let body = '';
    for await (const chunk of req) body += chunk;
    settings = { ...settings, ...JSON.parse(body || '{}') };
    return json(res, 200, { settings });
  }
  if (path === '/api/notifications/test' && req.method === 'POST') return json(res, 202, { sent: true, ok: true });
  const itemMatch = path.match(/^\/api\/items\/([^/]+)$/);
  if (itemMatch && req.method === 'PATCH') {
    let body = '';
    for await (const chunk of req) body += chunk;
    const item = items.find((i) => i.id === itemMatch[1]);
    if (!item) return json(res, 404, { error: 'not-found' });
    Object.assign(item, JSON.parse(body || '{}'), { updatedAt: new Date().toISOString() });
    return json(res, 200, { item });
  }
  if (itemMatch && req.method === 'DELETE') {
    const idx = items.findIndex((i) => i.id === itemMatch[1]);
    if (idx >= 0) items.splice(idx, 1);
    return json(res, 204);
  }
  const compMatch = path.match(/^\/api\/items\/([^/]+)\/completions\/(\d{4}-\d{2}-\d{2})$/);
  if (compMatch && req.method === 'PUT') {
    let body = '';
    for await (const chunk of req) body += chunk;
    const { status } = JSON.parse(body || '{}');
    const existing = completions.find((c) => c.itemId === compMatch[1] && c.date === compMatch[2]);
    if (existing) { existing.status = status; existing.updatedAt = new Date().toISOString(); }
    else completions.push({ itemId: compMatch[1], date: compMatch[2], status, updatedAt: new Date().toISOString() });
    return json(res, 200, { completion: completions.find((c) => c.itemId === compMatch[1] && c.date === compMatch[2]) });
  }
  if (compMatch && req.method === 'DELETE') {
    const idx = completions.findIndex((c) => c.itemId === compMatch[1] && c.date === compMatch[2]);
    if (idx >= 0) completions.splice(idx, 1);
    return json(res, 204);
  }
  if (path === '/api/items' && req.method === 'POST') {
    let body = '';
    for await (const chunk of req) body += chunk;
    const item = { id: `new-${nextId++}`, clientId, archived: false, description: null, reminderTime: null, createdAt: now, updatedAt: now, ...JSON.parse(body) };
    items.push(item);
    return json(res, 201, { item });
  }
  json(res, 404, { error: 'not-found' });
});

server.listen(3000, () => console.log('mock api on :3000'));

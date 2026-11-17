// API tests: run against a built server (next start) using a throwaway Postgres and test/mock-openai.mjs.
// Wipes every table first, so it refuses to run unless TEST_DATABASE=1 is set.
//
//   TEST_DATABASE=1 DATABASE_URL=... DATABASE_DRIVER=pg npm test
//
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { hashPassword } from '../lib/auth-core.js';
import { closeDb, query, sql } from '../lib/db.js';

const BASE = process.env.TEST_BASE_URL || 'http://localhost:3000';
const MOCK = process.env.TEST_MOCK_URL || 'http://localhost:4010';
const VERSION = { 'X-AAI-Extension-Version': '9.9.9' };

if (process.env.TEST_DATABASE !== '1') {
  throw new Error('Refusing to run: these tests wipe the database. Set TEST_DATABASE=1 for a throwaway database.');
}

async function api(path, { token, method, body, headers = {} } = {}) {
  const res = await fetch(BASE + path, {
    method: method || (body ? 'POST' : 'GET'),
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { status: res.status, data };
}

/** POST /api/generate and collect its server-sent events */
async function generate(token, body) {
  const { status, data } = await api('/api/generate', { token, body, headers: VERSION });
  if (status !== 200) {
    return { status, events: [], error: data };
  }
  const events = data.split('\n\n').filter((e) => e.startsWith('data:')).map((e) => JSON.parse(e.slice(5)));
  return { status, events, done: events.find((e) => e.type === 'done'), error: events.find((e) => e.type === 'error') };
}

const lastAiRequest = async () => (await fetch(`${MOCK}/__last`)).json();

/** Usage is written after the response; wait for it */
async function waitFor(fn, { timeout = 5000 } = {}) {
  const start = Date.now();
  for (;;) {
    const value = await fn();
    if (value) {
      return value;
    }
    if (Date.now() - start > timeout) {
      throw new Error('Timed out waiting');
    }
    await new Promise((r) => setTimeout(r, 100));
  }
}

async function login(email, password) {
  const { status, data } = await api('/api/auth/login', { body: { email, password, client: 'extension' }, headers: VERSION });
  assert.equal(status, 200, `login ${email}: ${JSON.stringify(data)}`);
  return data.token;
}

/** Create a user through the admin API, then replace the temporary password */
async function createUser(adminToken, fields, password) {
  const created = await api('/api/admin/users', { token: adminToken, body: fields });
  assert.equal(created.status, 201, JSON.stringify(created.data));
  const token = await login(fields.email, created.data.tempPassword);
  const changed = await api('/api/auth/password', { token, body: { currentPassword: created.data.tempPassword, newPassword: password } });
  assert.equal(changed.status, 200);
  return { id: created.data.user.id, token };
}

const state = {};

before(async () => {
  await query(`TRUNCATE result_outcomes, usage_event_rooftops, usage_events, feedback, prompt_versions, prompts,
               sessions, user_rooftops, users, rooftops RESTART IDENTITY CASCADE`);
  await sql`
    INSERT INTO users (email, name, role, is_developer, password_hash, must_change_password)
    VALUES ('admin@example.com', 'Admin', 'admin', true, ${await hashPassword('AdminPass-1234')}, false)`;
  await sql`INSERT INTO prompts (mode, content) VALUES ('enhance', 'Enhance prompt v1'), ('response', 'Reply prompt v1')`;
  state.admin = await login('admin@example.com', 'AdminPass-1234');
});

after(async () => {
  await closeDb();
});

test('sign-in errors and lockout', async () => {
  assert.equal((await api('/api/auth/login', { body: { email: 'admin@example.com', password: 'nope' } })).status, 401);
  assert.equal((await api('/api/me')).status, 401);

  await sql`INSERT INTO users (email, password_hash, role) VALUES ('locked@example.com', ${await hashPassword('Correct-Password-1')}, 'admin')`;
  for (let i = 0; i < 5; i++) {
    await api('/api/auth/login', { body: { email: 'locked@example.com', password: 'wrong' } });
  }
  const locked = await api('/api/auth/login', { body: { email: 'locked@example.com', password: 'Correct-Password-1' } });
  assert.equal(locked.status, 423);
});

test('rooftops with store details, and users', async () => {
  const add = (body) => api('/api/admin/rooftops', { token: state.admin, body });
  const nis = await add({ name: 'NIS', fullName: 'Ancira Nissan', address: '10835 I-10', phone: '210-714-2040', hours: 'Mon-Sat 9-8' });
  assert.equal(nis.status, 201);
  state.nis = nis.data.rooftop.id;
  state.awc = (await add({ name: 'AWC', fullName: 'Ancira-Winton Chevrolet' })).data.rooftop.id;
  assert.equal((await add({ name: 'NIS' })).status, 409);

  // Regular users need a rooftop
  const noRooftop = await api('/api/admin/users', { token: state.admin, body: { email: 'x@example.com' } });
  assert.equal(noRooftop.status, 400);

  state.single = await createUser(state.admin, { email: 'single@example.com', name: 'Single', rooftopIds: [state.nis] }, 'Single-Pass-123');
  state.multi = await createUser(state.admin, { email: 'multi@example.com', name: 'Multi', rooftopIds: [state.nis, state.awc] }, 'Multi-Pass-123');

  const me = await api('/api/me', { token: state.multi.token });
  assert.deepEqual(me.data.user.rooftops.map((r) => r.name), ['AWC', 'NIS']);

  // Temporary passwords block generation until changed
  const temp = await api('/api/admin/users', { token: state.admin, body: { email: 'temp@example.com', rooftopIds: [state.nis] } });
  const tempToken = await login('temp@example.com', temp.data.tempPassword);
  assert.equal((await generate(tempToken, { mode: 'enhance', text: 'hello there friend' })).status, 403);

  // Regular users can't use admin endpoints
  assert.equal((await api('/api/admin/users', { token: state.single.token })).status, 403);
});

test('generation streams and sends the sender\'s store details to the AI', async () => {
  const result = await generate(state.single.token, { mode: 'response', text: 'where are you located?' });
  assert.equal(result.status, 200);
  assert.ok(result.events.some((e) => e.type === 'delta'));
  assert.match(result.done.text, /Mock reply from gpt-6-luna/);
  assert.match(result.done.requestId, /^[0-9a-f-]{36}$/);

  const ai = await lastAiRequest();
  const system = ai.messages[0].content;
  assert.match(system, /^Reply prompt v1/);
  assert.match(system, /works at NIS \(Ancira Nissan\)/);
  assert.match(system, /10835 I-10, phone 210-714-2040, hours: Mon-Sat 9-8/);

  // The usage row is written after the response, attributed fully to NIS
  const row = await waitFor(async () => (await sql`
    SELECT e.id, e.variant, e.total_ms, array_agg(s.share::float) AS shares
    FROM usage_events e JOIN usage_event_rooftops s ON s.event_id = e.id
    WHERE e.request_id = ${result.done.requestId} GROUP BY e.id`)[0]);
  assert.deepEqual(row.shares, [1]);
  assert.ok(row.total_ms >= 0);
});

test('multi-store users: split usage, or 100% to the chosen store', async () => {
  const split = await generate(state.multi.token, { mode: 'enhance', text: 'see you at noon tomorrow', variant: 'initial' });
  assert.match((await lastAiRequest()).messages[0].content, /works at these dealerships/);
  const splitShares = await waitFor(async () => {
    const rows = await sql`
      SELECT s.share::float AS share FROM usage_event_rooftops s JOIN usage_events e ON e.id = s.event_id
      WHERE e.request_id = ${split.done.requestId}`;
    return rows.length ? rows.map((r) => r.share) : null;
  });
  assert.deepEqual(splitShares, [0.5, 0.5]);

  const chosen = await generate(state.multi.token, { mode: 'enhance', text: 'see you at noon tomorrow', rooftopId: state.awc, variant: 'Shorter' });
  assert.match((await lastAiRequest()).messages[0].content, /works at AWC \(Ancira-Winton Chevrolet\)/);
  const chosenRows = await waitFor(async () => {
    const rows = await sql`
      SELECT s.rooftop_id, s.share::float AS share, e.variant FROM usage_event_rooftops s JOIN usage_events e ON e.id = s.event_id
      WHERE e.request_id = ${chosen.done.requestId}`;
    return rows.length ? rows : null;
  });
  assert.deepEqual(chosenRows.map((r) => [r.rooftop_id, r.share, r.variant]), [[state.awc, 1, 'Shorter']]);
  state.chosenRequest = chosen.done.requestId;
});

test('outcomes and ratings, owner only', async () => {
  const id = state.chosenRequest;
  assert.equal((await api('/api/outcome', { token: state.multi.token, body: { requestId: id, rating: 1 } })).status, 200);
  assert.equal((await api('/api/outcome', { token: state.multi.token, body: { requestId: id, outcome: 'used', edited: true } })).status, 200);
  assert.equal((await api('/api/outcome', { token: state.single.token, body: { requestId: id, rating: -1 } })).status, 404);
  assert.equal((await api('/api/outcome', { token: state.multi.token, body: { requestId: 'not-a-uuid' } })).status, 400);

  const [o] = await sql`SELECT outcome, edited, rating FROM result_outcomes WHERE request_id = ${id}`;
  assert.deepEqual(o, { outcome: 'used', edited: true, rating: 1 });
});

test('usage report adds up and includes outcomes', async () => {
  const { status, data } = await api('/api/admin/usage', { token: state.admin });
  assert.equal(status, 200);
  const rooftopTotal = data.byRooftop.reduce((sum, r) => sum + r.requests, 0);
  assert.equal(Math.round(rooftopTotal * 1000) / 1000, data.totals.requests);
  assert.equal(data.totals.used, 1);
  assert.equal(data.totals.thumbs_up, 1);
  const shorter = data.byVariant.find((v) => v.variant === 'Shorter');
  assert.equal(shorter.used, 1);
});

test('disabled rooftops and users lose access', async () => {
  await api(`/api/admin/rooftops/${state.nis}`, { token: state.admin, method: 'PATCH', body: { active: false } });
  assert.equal((await api('/api/me', { token: state.single.token })).status, 403); // only store disabled
  assert.equal((await api('/api/me', { token: state.multi.token })).status, 200); // still has AWC
  await api(`/api/admin/rooftops/${state.nis}`, { token: state.admin, method: 'PATCH', body: { active: true } });

  await api(`/api/admin/users/${state.single.id}`, { token: state.admin, method: 'PATCH', body: { active: false } });
  assert.equal((await api('/api/me', { token: state.single.token })).status, 401); // sessions revoked
});

test('feedback is visible to developers only', async () => {
  const sent = await api('/api/feedback', { token: state.multi.token, body: { message: 'Too formal', mode: 'response', rooftopId: state.awc }, headers: VERSION });
  assert.equal(sent.status, 201);
  assert.equal((await api('/api/feedback', { token: state.multi.token, body: { message: ' ' } })).status, 400);
  assert.equal((await api('/api/admin/feedback', { token: state.multi.token })).status, 403);

  const list = await api('/api/admin/feedback', { token: state.admin });
  assert.equal(list.data.counts.new, 1);
  assert.equal(list.data.items[0].rooftop_name, 'AWC');

  const resolved = await api(`/api/admin/feedback/${list.data.items[0].id}`, { token: state.admin, method: 'PATCH', body: { status: 'resolved' } });
  assert.ok(resolved.data.item.resolved_at);

  await sql`UPDATE users SET is_developer = false WHERE email = 'admin@example.com'`;
  assert.equal((await api('/api/admin/feedback', { token: state.admin })).status, 403);
  await sql`UPDATE users SET is_developer = true WHERE email = 'admin@example.com'`;
});

test('prompt saves are versioned and can be restored', async () => {
  const save = (content, note) => api('/api/admin/prompts', { token: state.admin, method: 'PUT', body: { mode: 'response', content, note } });
  assert.equal((await save('Reply prompt v2')).status, 200);
  const history = await api('/api/admin/prompts/history?mode=response', { token: state.admin });
  assert.equal(history.data.versions[0].content, 'Reply prompt v2');

  await save('Reply prompt v1', 'Restored');
  await new Promise((r) => setTimeout(r, 100));
  const [current] = await sql`SELECT content FROM prompts WHERE mode = 'response'`;
  assert.equal(current.content, 'Reply prompt v1');
});

test('outdated extensions are asked to update', async () => {
  const old = await api('/api/me', { token: state.multi.token, headers: { 'X-AAI-Extension-Version': '2.0.0' } });
  assert.equal(old.status, 426);
  assert.equal(old.data.code, 'update_required');
});

test('AI errors are reported in the stream', async () => {
  const result = await generate(state.multi.token, { mode: 'response', text: 'FAIL429 please' });
  assert.equal(result.status, 200);
  assert.match(result.error.error, /busy|spending limit/);
});

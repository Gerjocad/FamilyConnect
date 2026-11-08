import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { openDatabase } from '../src/db.js';

let server;
let base;
before(async () => {
  const app = createApp(openDatabase(':memory:'));
  await new Promise((resolve) => { server = app.listen(0, resolve); });
  base = `http://127.0.0.1:${server.address().port}/api`;
});
after(() => server.close());

async function api(path, { token, method = 'GET', body } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, data: await res.json() };
}

test('eigene Übersicht speichern, laden und zurücksetzen', async () => {
  const { data: { token } } = await api('/auth/register', { method: 'POST', body: { name: 'Ida', email: 'ida@dash.test', password: 'geheim123' } });
  assert.equal((await api('/me', { token })).data.dashboard, null, 'Standard');
  assert.equal((await api('/me/dashboard', { token, method: 'PUT', body: { order: ['x y'], hidden: [] } })).status, 400);
  const saved = await api('/me/dashboard', { token, method: 'PUT', body: { order: ['meals', 'calendar', 'meals'], hidden: ['weather'] } });
  assert.deepEqual(saved.data.dashboard, { order: ['meals', 'calendar'], hidden: ['weather'] });
  assert.deepEqual((await api('/me', { token })).data.dashboard, { order: ['meals', 'calendar'], hidden: ['weather'] });
  await api('/me/dashboard', { token, method: 'PUT', body: { reset: true } });
  assert.equal((await api('/me', { token })).data.dashboard, null);
});

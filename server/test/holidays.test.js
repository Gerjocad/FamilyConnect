import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { openDatabase } from '../src/db.js';
import { HolidayService } from '../src/holidays.js';

let server;
let base;
const calls = [];
before(async () => {
  // OpenHolidays wird nachgebildet
  const fetchImpl = async (url) => {
    calls.push(url);
    const u = new URL(url);
    if (u.searchParams.get('subdivisionCode') !== 'DE-NW') return new Response('[]', { status: 200 });
    const body = u.pathname === '/PublicHolidays'
      ? [{ startDate: '2026-10-03', endDate: '2026-10-03', name: [{ language: 'DE', text: 'Tag der Deutschen Einheit' }] }]
      : [{ startDate: '2026-10-17', endDate: '2026-10-31', name: [{ language: 'DE', text: 'Herbstferien' }] }];
    return new Response(JSON.stringify(body), { status: 200 });
  };
  const app = createApp(openDatabase(':memory:'), { holidays: new HolidayService({ fetchImpl }) });
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
  return { status: res.status, data: res.status === 204 ? null : await res.json() };
}

describe('Ferien und Feiertage', () => {
  test('nach Bundesland der Familie, zwischengespeichert', async () => {
    const { data: { token } } = await api('/auth/register', { method: 'POST', body: { name: 'Mama', email: 'mama@ferien.test', password: 'geheim123' } });
    const { data: fam } = await api('/families', { token, method: 'POST', body: { name: 'F' } });
    assert.deepEqual((await api(`/families/${fam.id}/holidays?year=2026`, { token })).data, { state: null, public: [], school: [] });

    assert.equal((await api(`/families/${fam.id}`, { token, method: 'PATCH', body: { state: 'XX' } })).status, 400);
    const { data: updated } = await api(`/families/${fam.id}`, { token, method: 'PATCH', body: { state: 'NW' } });
    assert.equal(updated.state, 'NW');
    assert.equal(updated.name, 'F', 'Name bleibt');

    const { data } = await api(`/families/${fam.id}/holidays?year=2026`, { token });
    assert.deepEqual(data, {
      state: 'NW',
      public: [{ date: '2026-10-03', name: 'Tag der Deutschen Einheit' }],
      school: [{ start: '2026-10-17', end: '2026-10-31', name: 'Herbstferien' }],
    });
    const before = calls.length;
    await api(`/families/${fam.id}/holidays?year=2026`, { token });
    assert.equal(calls.length, before, 'aus dem Zwischenspeicher');
    assert.equal((await api(`/families/${fam.id}/holidays?year=abc`, { token })).status, 400);
  });
});

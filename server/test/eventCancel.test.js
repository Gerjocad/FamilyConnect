import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { openDatabase } from '../src/db.js';
import { PushService } from '../src/push.js';
import { isCancelled } from '../src/wall.js';

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
  return { status: res.status, data: res.status === 204 ? null : await res.json() };
}

describe('Termine absagen', () => {
  test('abgesagt bleibt gespeichert, auch einzelne Tage einer Serie', async () => {
    const { data: { token } } = await api('/auth/register', { method: 'POST', body: { name: 'Mama', email: 'mama@absage.test', password: 'geheim123' } });
    const { data: fam } = await api('/families', { token, method: 'POST', body: { name: 'F' } });
    const path = `/families/${fam.id}/events`;
    const { data: ev } = await api(path, { token, method: 'POST', body: { title: 'Training', start: '2026-11-02T17:00', end: '2026-11-02T18:30', recurrence: 'weekly' } });
    assert.equal(ev.cancelled, false);
    assert.deepEqual(ev.cancelled_dates, []);
    const { data: one } = await api(`${path}/${ev.id}`, { token, method: 'PATCH', body: { cancelled_dates: ['2026-11-09'] } });
    assert.deepEqual(one.cancelled_dates, ['2026-11-09']);
    const { data: all } = await api(`${path}/${ev.id}`, { token, method: 'PATCH', body: { cancelled: true } });
    assert.equal(all.cancelled, true);
    const { status } = await api(`${path}/${ev.id}`, { token, method: 'PATCH', body: { cancelled_dates: ['kein-datum'] } });
    assert.equal(status, 400);
  });

  test('isCancelled: ganzer Termin oder nur dieser Tag', () => {
    const event = { cancelled: false, cancelled_dates: ['2026-11-09'] };
    assert.equal(isCancelled({ event, start: new Date(2026, 10, 9, 17) }), true);
    assert.equal(isCancelled({ event, start: new Date(2026, 10, 16, 17) }), false);
    assert.equal(isCancelled({ event: { ...event, cancelled: true }, start: new Date(2026, 10, 16, 17) }), true);
  });

  test('Beteiligte bekommen „Abgesagt“ bzw. „Findet doch statt“', () => {
    const push = new PushService(null, { project_id: 'x' });
    const sent = [];
    push.sendToUsers = async (ids, m) => { sent.push([ids, m]); };
    const before = { id: 7, title: 'Zahnarzt', start: '2026-11-03T10:00', all_day: false, member_ids: [2, 3], cancelled: false, cancelled_dates: [] };
    const user = { id: 2, name: 'Mama Muster' };
    const change = (row) => push.handleChange({ action: 'update', path: 'events', row: { ...before, ...row }, before, user, familyId: 1 });

    change({ title: 'Zahnarzt (neu)' });
    assert.equal(sent.length, 0, 'normale Änderung → keine Absage-Nachricht');
    change({ cancelled: true });
    assert.deepEqual(sent.at(-1)[0], [3], 'nicht an mich selbst');
    assert.equal(sent.at(-1)[1].title, '❌ Abgesagt: Zahnarzt');
    assert.match(sent.at(-1)[1].body, /^Di\., 3\. Nov\.?, 10:00 Uhr \(von Mama\)$/);
    assert.equal(sent.at(-1)[1].path, '/kalender?tag=2026-11-03&termin=7');

    push.handleChange({ action: 'update', path: 'events', row: { ...before, cancelled: false }, before: { ...before, cancelled: true }, user, familyId: 1 });
    assert.equal(sent.at(-1)[1].title, '✅ Findet doch statt: Zahnarzt');

    change({ cancelled_dates: ['2026-11-10'] });
    assert.equal(sent.at(-1)[1].title, '❌ Abgesagt: Zahnarzt');
    assert.equal(sent.at(-1)[1].path, '/kalender?tag=2026-11-10&termin=7');
  });
});

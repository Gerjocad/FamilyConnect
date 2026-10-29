import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
  return { status: res.status, data: res.status === 204 ? null : await res.json() };
}

describe('Kommentare beim Verschieben', () => {
  test('alte, früher verschobene Einzeltermine: Chat wird beim Start als „Alter Chat“ übernommen', () => {
    const file = join(mkdtempSync(join(tmpdir(), 'fc-')), 'test.db');
    const db = openDatabase(file);
    db.exec("INSERT INTO users (id, name, email, password_hash, color) VALUES (1, 'M', 'm@x', 'x', '#000')");
    db.exec("INSERT INTO families (id, name, invite_code) VALUES (1, 'F', 'abc')");
    db.exec("INSERT INTO events (id, family_id, title, start, end, created_by) VALUES (1, 1, 'Grillen', '2026-11-14T15:00', '2026-11-14T18:00', 1)");
    db.exec("INSERT INTO event_comments (family_id, event_id, date, user_id, text) VALUES (1, 1, '2026-11-07', 1, 'Salat'), (1, 1, '2026-11-14', 1, 'Neu')");
    db.close();
    const reopened = openDatabase(file);
    assert.deepEqual(reopened.prepare('SELECT date, moved_from FROM event_comments ORDER BY id').all().map((r) => [r.date, r.moved_from]),
      [['2026-11-14', '2026-11-07'], ['2026-11-14', null]]);
    reopened.close();
  });

  test('Einzeltermin: Chat zieht mit und wird „Alter Chat“, zurückverschoben wieder normal', async () => {
    const { data: { token } } = await api('/auth/register', { method: 'POST', body: { name: 'Mama', email: 'mama@chat.test', password: 'geheim123' } });
    const { data: fam } = await api('/families', { token, method: 'POST', body: { name: 'F' } });
    const f = `/families/${fam.id}`;
    const comments = async () => (await api(`${f}/event-comments`, { token })).data;
    const { data: ev } = await api(`${f}/events`, { token, method: 'POST', body: { title: 'Grillen', start: '2026-11-07T15:00', end: '2026-11-07T18:00' } });
    await api(`${f}/events/${ev.id}/comments`, { token, method: 'POST', body: { date: '2026-11-07', text: 'Ich bringe Salat mit' } });
    await api(`${f}/events/${ev.id}`, { token, method: 'PATCH', body: { start: '2026-11-14T15:00', end: '2026-11-14T18:00' } });
    let [c] = await comments();
    assert.equal(c.date, '2026-11-14');
    assert.equal(c.moved_from, '2026-11-07');
    // nochmal verschieben: der ursprüngliche Tag bleibt
    await api(`${f}/events/${ev.id}`, { token, method: 'PATCH', body: { start: '2026-11-21T15:00', end: '2026-11-21T18:00' } });
    [c] = await comments();
    assert.deepEqual([c.date, c.moved_from], ['2026-11-21', '2026-11-07']);
    // nur die Uhrzeit ändern → nichts passiert
    await api(`${f}/events/${ev.id}`, { token, method: 'PATCH', body: { start: '2026-11-21T16:00', end: '2026-11-21T18:00' } });
    [c] = await comments();
    assert.equal(c.date, '2026-11-21');
    // zurück auf den alten Tag → wieder normaler Chat
    await api(`${f}/events/${ev.id}`, { token, method: 'PATCH', body: { start: '2026-11-07T15:00', end: '2026-11-07T18:00' } });
    [c] = await comments();
    assert.deepEqual([c.date, c.moved_from], ['2026-11-07', null]);
  });

  test('Serie: jeder Tag rückt mit; einzelner Tag als eigener Termin nimmt seinen Chat mit', async () => {
    const { data: { token } } = await api('/auth/register', { method: 'POST', body: { name: 'Mama', email: 'mama2@chat.test', password: 'geheim123' } });
    const { data: fam } = await api('/families', { token, method: 'POST', body: { name: 'F' } });
    const f = `/families/${fam.id}`;
    const comments = async () => (await api(`${f}/event-comments`, { token })).data;
    const { data: ev } = await api(`${f}/events`, { token, method: 'POST', body: { title: 'Training', start: '2026-11-02T17:00', end: '2026-11-02T18:00', recurrence: 'weekly' } });
    await api(`${f}/events/${ev.id}/comments`, { token, method: 'POST', body: { date: '2026-11-09', text: 'Wer fährt?' } });
    await api(`${f}/events/${ev.id}/comments`, { token, method: 'POST', body: { date: '2026-11-16', text: 'Ich hole ab' } });
    // ganze Serie von Montag auf Dienstag
    await api(`${f}/events/${ev.id}`, { token, method: 'PATCH', body: { start: '2026-11-03T17:00', end: '2026-11-03T18:00' } });
    assert.deepEqual((await comments()).map((c) => [c.date, c.moved_from]), [['2026-11-10', '2026-11-09'], ['2026-11-17', '2026-11-16']]);
    // nur der 17. wird ein eigener Termin am 18.
    const { data: single } = await api(`${f}/events`, { token, method: 'POST', body: { title: 'Training', start: '2026-11-18T17:00', end: '2026-11-18T18:00' } });
    const { data: moved } = await api(`${f}/events/${ev.id}/comments/move`, { token, method: 'POST', body: { to_event: single.id, from_date: '2026-11-17', to_date: '2026-11-18' } });
    assert.equal(moved.moved, 1);
    const after = await comments();
    assert.deepEqual(after.map((c) => [c.event_id, c.date, c.moved_from]), [[ev.id, '2026-11-10', '2026-11-09'], [single.id, '2026-11-18', '2026-11-16']]);
    const { status } = await api(`${f}/events/${ev.id}/comments/move`, { token, method: 'POST', body: { to_event: 99999, from_date: '2026-11-10', to_date: '2026-11-10' } });
    assert.equal(status, 404);
  });
});

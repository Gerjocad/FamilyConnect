import { after, before, describe, test } from 'node:test';
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
  return { status: res.status, data: res.status === 204 ? null : await res.json() };
}

let n = 0;
async function family() {
  n += 1;
  const reg = async (name) => (await api('/auth/register', {
    method: 'POST', body: { name, email: `${name}${n}@mitglied.test`, password: 'geheim123' },
  })).data.token;
  const mama = await reg('Mama');
  const tom = await reg('Tom');
  const { data: fam } = await api('/families', { token: mama, method: 'POST', body: { name: 'F' } });
  const { data: joined } = await api('/families/join', { token: tom, method: 'POST', body: { code: fam.invite_code } });
  return { mama, tom, fid: fam.id, ids: Object.fromEntries(joined.members.map((m) => [m.name, m.id])) };
}

describe('Mitglieder ohne Handy', () => {
  test('anlegen, zuweisen, später eigenes Konto', async () => {
    const { mama, tom, fid } = await family();
    assert.equal((await api(`/families/${fid}/members/managed`, { token: tom, method: 'POST', body: { name: 'Ela' } })).status, 403);
    const { status, data: fam } = await api(`/families/${fid}/members/managed`, { token: mama, method: 'POST', body: { name: 'Ela' } });
    assert.equal(status, 201);
    const ela = fam.members.find((m) => m.name === 'Ela');
    assert.equal(ela.managed, true);
    assert.equal(ela.role, 'child');
    // als Person nutzbar, z. B. für Aufgaben
    const task = await api(`/families/${fid}/tasks`, { token: mama, method: 'POST', body: { title: 'Zähne putzen', assignee_id: ela.id } });
    assert.equal(task.status, 201);
    // Name/Farbe ändert der Admin
    const renamed = await api(`/families/${fid}/members/${ela.id}`, { token: mama, method: 'PATCH', body: { name: 'Elanur', color: '#2f9e44' } });
    assert.equal(renamed.data.members.find((m) => m.id === ela.id).name, 'Elanur');
    // Konto einrichten → Anmeldung möglich
    const setup = await api(`/families/${fid}/members/${ela.id}/account`, { token: mama, method: 'PUT', body: { email: `ela${n}@mitglied.test`, password: 'kinder123' } });
    assert.equal(setup.status, 200);
    assert.equal(setup.data.members.find((m) => m.id === ela.id).managed, false);
    const login = await api('/auth/login', { method: 'POST', body: { email: `ela${n}@mitglied.test`, password: 'kinder123' } });
    assert.equal(login.status, 200);
    const { data: me } = await api('/me', { token: login.data.token });
    assert.equal(me.families[0].id, fid);
  });

  test('ohne Konto keine Anmeldung, beim Entfernen ganz weg', async () => {
    const { mama, fid } = await family();
    const { data: fam } = await api(`/families/${fid}/members/managed`, { token: mama, method: 'POST', body: { name: 'Baby' } });
    const baby = fam.members.find((m) => m.name === 'Baby');
    const { data: after } = await api(`/families/${fid}/members/${baby.id}`, { token: mama, method: 'DELETE' });
    assert.ok(!after.members.some((m) => m.id === baby.id));
    const wrongName = await api(`/families/${fid}/members/${after.members[1].id}`, { token: mama, method: 'PATCH', body: { name: 'X' } });
    assert.equal(wrongName.status, 400, 'eigene Konten benennen sich selbst');
  });
});

describe('Kommentare an Terminen', () => {
  test('schreiben, lesen, löschen', async () => {
    const { mama, tom, fid } = await family();
    const { data: ev } = await api(`/families/${fid}/events`, { token: mama, method: 'POST', body: {
      title: 'Training', start: '2026-10-21T17:00', end: '2026-10-21T18:30', recurrence: 'weekly',
    } });
    const c1 = await api(`/families/${fid}/events/${ev.id}/comments`, { token: tom, method: 'POST', body: { text: 'Fällt heute aus!', date: '2026-10-28' } });
    assert.equal(c1.status, 201);
    assert.equal(c1.data.date, '2026-10-28');
    const c2 = await api(`/families/${fid}/events/${ev.id}/comments`, { token: mama, method: 'POST', body: { text: 'Danke' } });
    assert.equal(c2.data.date, '2026-10-21', 'ohne Datum: Beginn');
    assert.equal((await api(`/families/${fid}/events/${ev.id}/comments`, { token: mama, method: 'POST', body: { text: ' ' } })).status, 400);
    assert.equal((await api(`/families/${fid}/event-comments`, { token: tom })).data.length, 2);
    assert.equal((await api(`/families/${fid}/event-comments/${c2.data.id}`, { token: tom, method: 'DELETE' })).status, 403);
    assert.equal((await api(`/families/${fid}/event-comments/${c1.data.id}`, { token: mama, method: 'DELETE' })).status, 204);
    await api(`/families/${fid}/events/${ev.id}`, { token: mama, method: 'DELETE' });
    assert.equal((await api(`/families/${fid}/event-comments`, { token: tom })).data.length, 0, 'mit dem Termin gelöscht');
  });
});

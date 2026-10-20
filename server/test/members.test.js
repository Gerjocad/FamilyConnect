import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { openDatabase } from '../src/db.js';
import { newlyTagged } from '../src/activity.js';

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

describe('Neuigkeiten (Glocke)', () => {
  test('zeigt was andere geschrieben haben, gelesen-Stand', async () => {
    const { mama, tom, fid, ids } = await family();
    const { data: ev } = await api(`/families/${fid}/events`, { token: mama, method: 'POST', body: { title: 'Arzt', start: '2026-10-22T09:00', end: '2026-10-22T10:00' } });
    await api(`/families/${fid}/events/${ev.id}/comments`, { token: tom, method: 'POST', body: { text: 'Ich komme mit' } });
    await api(`/families/${fid}/events/${ev.id}/comments`, { token: mama, method: 'POST', body: { text: 'Super' } });
    await api(`/families/${fid}/posts`, { token: tom, method: 'POST', body: { text: 'Pizza heute?' } });
    await api(`/families/${fid}/requests`, { token: tom, method: 'POST', body: { title: 'Darf ich zu Ben?', recipient_id: ids.Mama } });

    const { data } = await api(`/families/${fid}/activity`, { token: mama });
    assert.equal(data.seen_at, null);
    assert.deepEqual(data.items.map((i) => i.kind).sort(), ['comment', 'post', 'request']);
    const comment = data.items.find((i) => i.kind === 'comment');
    assert.equal(comment.path, `/kalender?tag=2026-10-22&termin=${ev.id}`);
    assert.equal(comment.subject, 'Arzt');

    // Tom sieht Mamas Kommentar, aber nicht seine eigenen Sachen
    assert.deepEqual((await api(`/families/${fid}/activity`, { token: tom })).data.items.map((i) => i.text), ['Super']);

    assert.equal((await api(`/families/${fid}/activity/seen`, { token: mama, method: 'POST' })).status, 204);
    assert.ok((await api(`/families/${fid}/activity`, { token: mama })).data.seen_at);
  });
});

describe('Markierung bei Terminen', () => {
  test('Push und Glocke für neu eingetragene Personen', async () => {
    const { mama, tom, fid, ids } = await family();
    const { data: ev } = await api(`/families/${fid}/events`, { token: mama, method: 'POST', body: { title: 'Kino', start: '2026-10-24T18:00', end: '2026-10-24T20:00', member_ids: [ids.Mama, ids.Tom] } });
    let items = (await api(`/families/${fid}/activity`, { token: tom })).data.items;
    assert.equal(items.length, 1);
    assert.equal(items[0].kind, 'event');
    assert.equal(items[0].subject, 'Kino');
    assert.equal(items[0].path, `/kalender?tag=2026-10-24&termin=${ev.id}`);
    assert.equal((await api(`/families/${fid}/activity`, { token: mama })).data.items.length, 0, 'sich selbst markieren zählt nicht');

    // Erneut speichern ohne neue Personen → keine zweite Markierung
    await api(`/families/${fid}/events/${ev.id}`, { token: mama, method: 'PATCH', body: { title: 'Kino!' } });
    assert.equal((await api(`/families/${fid}/activity`, { token: tom })).data.items.length, 1);

    // Später dazugenommen → nur die Neuen
    const prev = { member_ids: [1] };
    assert.deepEqual(newlyTagged({ action: 'update', path: 'events', row: { member_ids: [1, 2, 3] }, before: prev, user: { id: 3 } }).sort(), [2]);
    assert.deepEqual(newlyTagged({ action: 'import', path: 'events', row: { member_ids: [2] }, before: null, user: { id: 1 } }), []);
  });
});


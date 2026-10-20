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
/** Mama (Admin), Tom und Lea (Kinder) */
async function family() {
  n += 1;
  const reg = async (name) => (await api('/auth/register', {
    method: 'POST', body: { name, email: `${name}${n}@urlaub.test`, password: 'geheim123' },
  })).data.token;
  const mama = await reg('Mama');
  const tom = await reg('Tom');
  const lea = await reg('Lea');
  const { data: fam } = await api('/families', { token: mama, method: 'POST', body: { name: 'F' } });
  await api('/families/join', { token: tom, method: 'POST', body: { code: fam.invite_code } });
  const { data: joined } = await api('/families/join', { token: lea, method: 'POST', body: { code: fam.invite_code } });
  const id = (name) => joined.members.find((m) => m.name === name).id;
  return { mama, tom, lea, fid: fam.id, ids: { mama: id('Mama'), tom: id('Tom'), lea: id('Lea') } };
}

describe('Urlaub', () => {
  test('anlegen, prüfen, Kinder nur eigene', async () => {
    const { mama, tom, lea, fid, ids } = await family();
    const path = `/families/${fid}/vacations`;
    const { status, data: trip } = await api(path, { token: mama, method: 'POST', body: {
      title: 'Ostsee', start_date: '2026-07-01', end_date: '2026-07-14', member_ids: [ids.mama, ids.tom], color: '#1c7ed6',
    } });
    assert.equal(status, 201);
    assert.deepEqual(trip.member_ids, [ids.mama, ids.tom]);

    const wrong = await api(path, { token: mama, method: 'POST', body: { title: 'X', start_date: '2026-07-10', end_date: '2026-07-01' } });
    assert.equal(wrong.status, 400);
    const badColor = await api(path, { token: mama, method: 'POST', body: { title: 'X', start_date: '2026-07-01', end_date: '2026-07-01', color: 'red' } });
    assert.equal(badColor.status, 400);

    const { status: kidStatus, data: camp } = await api(path, { token: lea, method: 'POST', body: {
      title: 'Zeltlager', start_date: '2026-07-05', end_date: '2026-07-09', member_ids: [ids.lea],
    } });
    assert.equal(kidStatus, 201);
    assert.equal((await api(`${path}/${trip.id}`, { token: tom, method: 'DELETE' })).status, 403);
    assert.equal((await api(`${path}/${camp.id}`, { token: lea, method: 'DELETE' })).status, 204);
    assert.equal((await api(path, { token: tom })).data.length, 1);
  });
});

describe('Kalender importieren', () => {
  test('neue anlegen, gleiche UID aktualisieren', async () => {
    const { mama, lea, fid, ids } = await family();
    const game = (uid, title, start) => ({
      title, start, end: start.replace(/T(\d\d)/, (_, h) => `T${String(Number(h) + 2).padStart(2, '0')}`), all_day: false,
      member_ids: [ids.mama], source: 'Fenerbahçe', source_uid: uid, reminder_minutes: 60,
    });
    const first = await api(`/families/${fid}/events/import`, { token: mama, method: 'POST', body: { items: [
      game('a@fb', 'Fenerbahçe – Galatasaray', '2026-10-25T18:00'),
      game('b@fb', 'Beşiktaş – Fenerbahçe', '2026-11-01T17:00'),
    ] } });
    assert.deepEqual(first.data, { created: 2, updated: 0 });
    const again = await api(`/families/${fid}/events/import`, { token: mama, method: 'POST', body: { items: [
      game('a@fb', 'Fenerbahçe – Galatasaray', '2026-10-25T19:00'),
      game('c@fb', 'Fenerbahçe – Trabzonspor', '2026-11-08T18:00'),
    ] } });
    assert.deepEqual(again.data, { created: 1, updated: 1 });
    const { data: events } = await api(`/families/${fid}/events`, { token: mama });
    assert.equal(events.length, 3);
    assert.equal(events.find((e) => e.source_uid === 'a@fb').start, '2026-10-25T19:00', 'verschoben');

    const bad = await api(`/families/${fid}/events/import`, { token: mama, method: 'POST', body: { items: [
      game('d@fb', 'ok', '2026-12-01T18:00'), { title: '', start: 'x' },
    ] } });
    assert.equal(bad.status, 400);
    assert.equal((await api(`/families/${fid}/events`, { token: mama })).data.length, 3, 'nichts halb importiert');

    // Kinder dürfen fremde importierte Termine nicht überschreiben
    const kid = await api(`/families/${fid}/events/import`, { token: lea, method: 'POST', body: { items: [game('a@fb', 'x', '2026-10-25T18:00')] } });
    assert.equal(kid.status, 403);
  });
});

test('importierten Kalender entfernen', async () => {
  const { mama, fid } = await family();
  const item = (uid, source) => ({ title: uid, start: '2026-10-25T18:00', end: '2026-10-25T20:00', source, source_uid: uid });
  await api(`/families/${fid}/events/import`, { token: mama, method: 'POST', body: { items: [item('a', 'FB'), item('b', 'FB'), item('c', 'Schule')] } });
  await api(`/families/${fid}/events`, { token: mama, method: 'POST', body: { title: 'Arzt', start: '2026-10-26T09:00', end: '2026-10-26T10:00' } });
  const { data } = await api(`/families/${fid}/events/import?source=FB`, { token: mama, method: 'DELETE' });
  assert.equal(data.deleted, 2);
  assert.deepEqual((await api(`/families/${fid}/events`, { token: mama })).data.map((e) => e.title).sort(), ['Arzt', 'c']);
});

test('Logos für Termine: nur Eltern, nur Bilder', async () => {
  const { mama, lea, fid } = await family();
  const png = 'data:image/png;base64,iVBORw0KGgo=';
  const path = `/families/${fid}/event-icons`;
  assert.equal((await api(path, { token: mama, method: 'POST', body: { keyword: 'Fenerbahçe', image: png } })).status, 201);
  assert.equal((await api(path, { token: mama, method: 'POST', body: { keyword: 'x', image: 'javascript:alert(1)' } })).status, 400);
  assert.equal((await api(path, { token: lea, method: 'POST', body: { keyword: 'Schule', image: png } })).status, 403);
  assert.deepEqual((await api(path, { token: lea })).data.map((i) => i.keyword), ['Fenerbahçe']);
});

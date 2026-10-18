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
    method: 'POST', body: { name, email: `${name}${n}@h.test`, password: 'geheim123' },
  })).data.token;
  const mama = await reg('Mama');
  const kind = await reg('Kind');
  const { data: fam } = await api('/families', { token: mama, method: 'POST', body: { name: 'F' } });
  await api('/families/join', { token: kind, method: 'POST', body: { code: fam.invite_code } });
  const { data } = await api(`/families/${fam.id}`, { token: mama });
  const id = (name) => data.members.find((m) => m.name === name).id;
  return { mama, kind, fid: fam.id, mamaId: id('Mama'), kindId: id('Kind') };
}

describe('Gewohnheiten', () => {
  test('anlegen mit NFC-Code und Validierung', async () => {
    const { mama, fid, kindId } = await family();
    const { status, data } = await api(`/families/${fid}/habits`, {
      token: mama, method: 'POST', body: { title: 'Duschen', emoji: '🚿', interval_days: 2, member_ids: [kindId], reminder_time: '19:30' },
    });
    assert.equal(status, 201);
    assert.match(data.nfc_token, /^[0-9a-f]{32}$/);
    assert.deepEqual(data.member_ids, [kindId]);
    const bad = async (body) => (await api(`/families/${fid}/habits`, { token: mama, method: 'POST', body: { title: 'X', interval_days: 1, ...body } })).status;
    assert.equal(await bad({ interval_days: 0 }), 400);
    assert.equal(await bad({ interval_days: 1.5 }), 400);
    assert.equal(await bad({ reminder_time: '25:00' }), 400);
    assert.equal(await bad({}), 201);
  });

  test('abhaken, doppelt abhaken, rückgängig', async () => {
    const { kind, fid } = await family();
    const { data: habit } = await api(`/families/${fid}/habits`, { token: kind, method: 'POST', body: { title: 'Zähne', interval_days: 1 } });
    const path = `/families/${fid}/habits/${habit.id}/checkins`;
    const first = await api(path, { token: kind, method: 'POST', body: { date: '2026-10-18' } });
    assert.equal(first.status, 201);
    assert.equal(first.data.already, false);
    const again = await api(path, { token: kind, method: 'POST', body: { date: '2026-10-18' } });
    assert.equal(again.status, 200);
    assert.equal(again.data.already, true);
    let list = (await api(`/families/${fid}/checkins?since=2026-10-01`, { token: kind })).data;
    assert.equal(list.length, 1);
    assert.equal(list[0].source, 'app');
    await api(path, { token: kind, method: 'DELETE', body: { date: '2026-10-18' } });
    list = (await api(`/families/${fid}/checkins`, { token: kind })).data;
    assert.equal(list.length, 0);
  });

  test('nur Teilnehmende; Admins dürfen für andere abhaken', async () => {
    const { mama, kind, fid, mamaId, kindId } = await family();
    const { data: habit } = await api(`/families/${fid}/habits`, {
      token: mama, method: 'POST', body: { title: 'Duschen', interval_days: 2, member_ids: [kindId] },
    });
    const path = `/families/${fid}/habits/${habit.id}/checkins`;
    assert.equal((await api(path, { token: mama, method: 'POST', body: { date: '2026-10-18' } })).status, 403, 'Mama nimmt nicht teil');
    assert.equal((await api(path, { token: mama, method: 'POST', body: { date: '2026-10-18', user_id: kindId } })).status, 201, 'Admin für Kind');
    assert.equal((await api(path, { token: kind, method: 'POST', body: { date: '2026-10-19', user_id: mamaId } })).status, 403, 'Kind nicht für andere');
  });

  test('NFC-Aufkleber hakt für die Person ab, deren Handy ihn liest', async () => {
    const { mama, kind, fid, kindId } = await family();
    const { data: habit } = await api(`/families/${fid}/habits`, { token: mama, method: 'POST', body: { title: 'Duschen', emoji: '🚿', interval_days: 2 } });
    const { status, data } = await api(`/habits/by-token/${habit.nfc_token}/checkin`, { token: kind, method: 'POST', body: { date: '2026-10-18' } });
    assert.equal(status, 201);
    assert.equal(data.checkin.user_id, kindId);
    assert.equal(data.checkin.source, 'nfc');
    assert.equal(data.habit.title, 'Duschen');
    assert.equal(data.habit.family_id, fid);

    // Fremde Familie kann den Aufkleber nicht benutzen
    const other = await family();
    assert.equal((await api(`/habits/by-token/${habit.nfc_token}/checkin`, { token: other.mama, method: 'POST', body: {} })).status, 404);
    // Neuer Code macht den alten ungültig
    const { data: renewed } = await api(`/families/${fid}/habits/${habit.id}/nfc-token`, { token: mama, method: 'POST' });
    assert.notEqual(renewed.nfc_token, habit.nfc_token);
    assert.equal((await api(`/habits/by-token/${habit.nfc_token}/checkin`, { token: kind, method: 'POST', body: {} })).status, 404);
  });

  test('Löschen einer Gewohnheit entfernt ihre Einträge', async () => {
    const { mama, fid } = await family();
    const { data: habit } = await api(`/families/${fid}/habits`, { token: mama, method: 'POST', body: { title: 'Sport', interval_days: 7 } });
    await api(`/families/${fid}/habits/${habit.id}/checkins`, { token: mama, method: 'POST', body: { date: '2026-10-18' } });
    await api(`/families/${fid}/habits/${habit.id}`, { token: mama, method: 'DELETE' });
    assert.deepEqual((await api(`/families/${fid}/checkins`, { token: mama })).data, []);
  });
});

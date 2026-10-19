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

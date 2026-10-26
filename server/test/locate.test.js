import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { openDatabase } from '../src/db.js';
import { distance } from '../src/locate.js';

const sent = [];
let server;
let base;
before(async () => {
  const push = { notify: (ids, m) => sent.push([ids, m]), handleChange() {} };
  const app = createApp(openDatabase(':memory:'), { push });
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

describe('Wo bist du?', () => {
  test('Entfernung', () => {
    assert.ok(Math.abs(distance({ lat: 51.2277, lon: 6.7735 }, { lat: 51.2277, lon: 6.7835 }) - 697) < 5);
  });

  test('fragen, antworten, ablehnen – nur Fragender und Gefragte sehen es', async () => {
    const reg = async (name) => (await api('/auth/register', { method: 'POST', body: { name, email: `${name}@wo.test`, password: 'geheim123' } })).data.token;
    const mama = await reg('Mama');
    const lea = await reg('Lea');
    const tom = await reg('Tom');
    const { data: fam } = await api('/families', { token: mama, method: 'POST', body: { name: 'F' } });
    await api('/families/join', { token: lea, method: 'POST', body: { code: fam.invite_code } });
    const { data: joined } = await api('/families/join', { token: tom, method: 'POST', body: { code: fam.invite_code } });
    const id = (name) => joined.members.find((m) => m.name === name).id;
    const f = `/families/${fam.id}`;
    await api(`${f}/places`, { token: mama, method: 'POST', body: { name: 'Schule', icon: '🏫', lat: 51.2277, lon: 6.7735, radius: 100 } });

    assert.equal((await api(`${f}/locate`, { token: mama, method: 'POST', body: { user_id: id('Mama') } })).status, 400);
    const { data: q } = await api(`${f}/locate`, { token: mama, method: 'POST', body: { user_id: id('Lea') } });
    assert.equal(q.status, 'pending');
    assert.deepEqual(sent.at(-1), [[id('Lea')], { title: '📍 Mama fragt: Wo bist du?', body: 'Antippen, um zu antworten', path: `/standort/${q.id}` }]);
    assert.equal((await api(`${f}/locate`, { token: mama, method: 'POST', body: { user_id: id('Lea') } })).status, 429, 'nicht gleich nochmal');

    assert.equal((await api(`${f}/locate/${q.id}`, { token: tom })).status, 404, 'Tom sieht es nicht');
    assert.equal((await api(`${f}/locate/${q.id}/answer`, { token: mama, method: 'POST', body: { lat: 1, lon: 1 } })).status, 404, 'nur Lea antwortet');
    assert.equal((await api(`${f}/locate/${q.id}/answer`, { token: lea, method: 'POST', body: {} })).status, 400);
    assert.equal((await api(`${f}/locate/${q.id}/answer`, { token: lea, method: 'POST', body: { lat: 200, lon: 1 } })).status, 400);

    const { data: a } = await api(`${f}/locate/${q.id}/answer`, { token: lea, method: 'POST', body: { lat: 51.2280, lon: 6.7740, accuracy: 25, message: 'Hole gleich ab' } });
    assert.equal(a.status, 'answered');
    assert.deepEqual(a.place, { id: a.place.id, name: 'Schule', icon: '🏫' });
    assert.deepEqual(sent.at(-1), [[id('Mama')], { title: '📍 Lea hat geantwortet', body: 'bei 🏫 Schule · Hole gleich ab', path: `/standort/${q.id}` }]);
    assert.equal((await api(`${f}/locate/${q.id}`, { token: mama })).data.accuracy, 25);

    // Tom sagt „nicht jetzt“
    const { data: q2 } = await api(`${f}/locate`, { token: mama, method: 'POST', body: { user_id: id('Tom') } });
    const { data: no } = await api(`${f}/locate/${q2.id}/answer`, { token: tom, method: 'POST', body: { declined: true } });
    assert.equal(no.status, 'declined');
    assert.equal(no.lat, null);
    assert.equal(sent.at(-1)[1].title, '📍 Tom: gerade nicht');

    assert.deepEqual((await api(`${f}/locate`, { token: lea })).data.map((r) => r.id), [q.id], 'Lea sieht nur ihre');
    assert.equal((await api(`${f}/locate`, { token: mama })).data.length, 2);

    // Freigabe für alle
    assert.equal((await api(f, { token: mama, method: 'PATCH', body: { locate_released: true } })).data.locate_released, true);
  });
});

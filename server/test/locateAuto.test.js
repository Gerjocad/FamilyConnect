import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { openDatabase } from '../src/db.js';
import { answersAutomatically } from '../src/locate.js';

const notes = [];
const data = [];
let devices = new Set();
let server;
let base;
before(async () => {
  const push = {
    notify: (ids, m) => notes.push([ids, m]),
    handleChange() {},
    sendData: async (ids, d) => { data.push([ids, d]); return ids.filter((id) => devices.has(id)).length; },
    devicesOf: (id) => (devices.has(id) ? 1 : 0),
  };
  const geocoder = { reverse: async () => 'Königsallee 12, 40212 Düsseldorf', search: async () => [] };
  const app = createApp(openDatabase(':memory:'), { push, geocoder, locateAutoTimeoutMs: 150 });
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
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

describe('Wo bist du? – automatische Antwort', () => {
  test('Regeln: Admin → alle, Eltern → Kinder', () => {
    assert.equal(answersAutomatically('admin', 'parent'), true);
    assert.equal(answersAutomatically('admin', 'child'), true);
    assert.equal(answersAutomatically('parent', 'child'), true);
    assert.equal(answersAutomatically('parent', 'parent'), false);
    assert.equal(answersAutomatically('parent', 'admin'), false);
    assert.equal(answersAutomatically('child', 'child'), false);
    assert.equal(answersAutomatically('child', 'parent'), false);
  });

  test('stille Antwort, Ersatzfrage bei Fehler oder ohne Antwort', async () => {
    const reg = async (name) => (await api('/auth/register', { method: 'POST', body: { name, email: `${name}@auto.test`, password: 'geheim123' } })).data.token;
    const mama = await reg('Mama');
    const papa = await reg('Papa');
    const lea = await reg('Lea');
    const { data: fam } = await api('/families', { token: mama, method: 'POST', body: { name: 'F' } });
    await api('/families/join', { token: papa, method: 'POST', body: { code: fam.invite_code } });
    const { data: joined } = await api('/families/join', { token: lea, method: 'POST', body: { code: fam.invite_code } });
    const id = (n) => joined.members.find((m) => m.name === n).id;
    const f = `/families/${fam.id}`;
    await api(`${f}/members/${id('Papa')}`, { token: mama, method: 'PATCH', body: { role: 'parent' } });
    devices = new Set([id('Lea'), id('Papa')]);

    // Mama (Admin) fragt Papa → automatisch
    const { data: q } = await api(`${f}/locate`, { token: mama, method: 'POST', body: { user_id: id('Papa') } });
    assert.equal(q.auto, true);
    const [ids, d] = data.at(-1);
    assert.deepEqual(ids, [id('Papa')]);
    assert.equal(d.type, 'locate_auto');
    assert.equal(Number(d.id), q.id);
    assert.equal(d.from, 'Mama');
    assert.ok(!notes.some(([to]) => to[0] === id('Papa')), 'keine sichtbare Frage');
    assert.equal((await api(`/locate/auto/${q.id}`, { method: 'POST', body: { secret: 'falsch', lat: 1, lon: 1 } })).status, 404);
    const { data: ok } = await api(`/locate/auto/${q.id}`, { method: 'POST', body: { secret: d.secret, lat: 51.22, lon: 6.78, accuracy: 9.4 } });
    assert.deepEqual(ok, { ok: true, from: 'Mama' });
    const { data: answered } = await api(`${f}/locate/${q.id}`, { token: mama });
    assert.deepEqual([answered.status, answered.address, answered.accuracy, answered.auto], ['answered', 'Königsallee 12, 40212 Düsseldorf', 9, true]);
    assert.equal(notes.at(-1)[1].title, '📍 Papa (automatisch)');
    assert.equal((await api(`/locate/auto/${q.id}`, { method: 'POST', body: { secret: d.secret, lat: 1, lon: 1 } })).status, 404, 'Schlüssel nur einmal');
    await wait(250);
    assert.ok(!notes.some(([to]) => to[0] === id('Papa')), 'nach der Antwort keine Ersatzfrage');

    // Papa (Eltern) fragt Lea (Kind) → automatisch; Handy meldet Fehler → normale Frage
    const { data: q2 } = await api(`${f}/locate`, { token: papa, method: 'POST', body: { user_id: id('Lea') } });
    assert.equal(q2.auto, true);
    await api(`/locate/auto/${q2.id}`, { method: 'POST', body: { secret: data.at(-1)[1].secret, failed: true } });
    assert.deepEqual(notes.at(-1)[0], [id('Lea')]);
    assert.equal(notes.at(-1)[1].title, '📍 Papa fragt: Wo bist du?');
    assert.equal((await api(`${f}/locate/${q2.id}`, { token: papa })).data.auto, false);

    // Lea fragt Papa → normal
    const { data: q3 } = await api(`${f}/locate`, { token: lea, method: 'POST', body: { user_id: id('Papa') } });
    assert.equal(q3.auto, false);
    assert.equal(notes.at(-1)[1].title, '📍 Lea fragt: Wo bist du?');

    // Mama fragt Lea, das Handy antwortet nicht → nach der Wartezeit normale Frage (genau einmal)
    const before = notes.length;
    const { data: q4 } = await api(`${f}/locate`, { token: mama, method: 'POST', body: { user_id: id('Lea') } });
    assert.equal(q4.auto, true);
    await wait(300);
    assert.deepEqual(notes.slice(before).map(([to, m]) => [to[0], m.title]), [[id('Lea'), '📍 Mama fragt: Wo bist du?']]);

  });
});

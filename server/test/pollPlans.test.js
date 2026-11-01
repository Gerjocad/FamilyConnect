import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { openDatabase } from '../src/db.js';

let server;
let base;
const notes = [];
before(async () => {
  const app = createApp(openDatabase(':memory:'), { push: { handleChange() {}, notify: (ids, m) => notes.push([ids, m]) } });
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
  const reg = async (name) => (await api('/auth/register', { method: 'POST', body: { name, email: `${name}${n}@plan.test`, password: 'geheim123' } })).data.token;
  const mama = await reg('Mama');
  const tom = await reg('Tom');
  const lea = await reg('Lea');
  const { data: fam } = await api('/families', { token: mama, method: 'POST', body: { name: 'F' } });
  await api('/families/join', { token: tom, method: 'POST', body: { code: fam.invite_code } });
  const { data: joined } = await api('/families/join', { token: lea, method: 'POST', body: { code: fam.invite_code } });
  return { mama, tom, lea, f: `/families/${fam.id}`, ids: Object.fromEntries(joined.members.map((m) => [m.name, m.id])) };
}

describe('Umfragen mit Ziel', () => {
  test('Essen: wenn alle abgestimmt haben, kommt der Sieger in den Essensplan', async () => {
    const { mama, tom, lea, f, ids } = await family();
    await api(`${f}/recipes`, { token: mama, method: 'POST', body: { title: 'Lahmacun' } });
    assert.equal((await api(`${f}/polls`, { token: lea, method: 'POST', body: { text: 'Essen?', options: ['A', 'B'], plan: { kind: 'meal', date: '2026-11-07' } } })).status, 400, 'Mahlzeit fehlt');
    const { status, data: poll } = await api(`${f}/polls`, { token: lea, method: 'POST', body: {
      text: 'Was essen wir am Samstag?', options: ['Pizza', 'lahmacun', 'Döner'], plan: { kind: 'meal', date: '2026-11-07', slot: 'dinner' },
    } });
    assert.equal(status, 201);
    assert.equal(poll.plan.kind, 'meal');
    const vote = (token, i) => api(`${f}/polls/${poll.post_id}/vote`, { token, method: 'PUT', body: { option_id: poll.options[i].id } });
    await vote(mama, 1);
    await vote(tom, 0);
    let res = await vote(lea, 2);
    assert.equal(res.data.plan.closed_at, null, 'Gleichstand → bleibt offen');
    res = await vote(lea, 1);
    assert.ok(res.data.plan.closed_at, 'alle abgestimmt, klarer Sieger');
    assert.equal(res.data.plan.result_option_id, poll.options[1].id);
    const meals = (await api(`${f}/meals`, { token: mama })).data;
    assert.deepEqual(meals.map((m) => [m.date, m.slot, m.title, Boolean(m.recipe_id)]), [['2026-11-07', 'dinner', 'lahmacun', true]]);
    assert.equal(notes.at(-1)[1].title, '🗳️ Entschieden: lahmacun');
    assert.deepEqual(notes.at(-1)[0].sort(), [ids.Mama, ids.Tom].sort(), 'nicht an die letzte Stimme');
    assert.equal((await vote(tom, 1)).status, 409, 'danach nicht mehr abstimmen');
  });

  test('Ausflug: beenden mit Gleichstand-Auswahl → Termin im Kalender', async () => {
    const { mama, tom, lea, f } = await family();
    const { data: poll } = await api(`${f}/polls`, { token: mama, method: 'POST', body: {
      text: 'Wohin am Sonntag?', options: ['Zoo', 'Schwimmbad'], plan: { kind: 'trip', date: '2026-11-08', start_time: '10:00', end_time: '16:00' },
    } });
    const vote = (token, i) => api(`${f}/polls/${poll.post_id}/vote`, { token, method: 'PUT', body: { option_id: poll.options[i].id } });
    await vote(mama, 0);
    await vote(tom, 1);
    const close = (token, body = {}) => api(`${f}/polls/${poll.post_id}/close`, { token, method: 'POST', body });
    assert.equal((await close(lea)).status, 403, 'Kinder beenden fremde Umfragen nicht');
    assert.equal((await close(mama)).status, 409, 'Gleichstand');
    const { data } = await close(mama, { option_id: poll.options[1].id });
    assert.ok(data.plan.closed_at);
    const events = (await api(`${f}/events`, { token: mama })).data;
    assert.deepEqual(events.map((e) => [e.title, e.start, e.end, e.all_day]), [['Schwimmbad', '2026-11-08T10:00', '2026-11-08T16:00', false]]);
    assert.equal(data.plan.result_ref, events[0].id);
    assert.match(notes.at(-1)[1].path, /^\/kalender\?tag=2026-11-08&termin=\d+$/);
    assert.equal((await close(mama)).status, 409, 'schon entschieden');
  });

  test('Ausflug ohne Uhrzeit wird ganztägig; Essen ersetzt geplante Mahlzeit', async () => {
    const { mama, f } = await family();
    const { data: trip } = await api(`${f}/polls`, { token: mama, method: 'POST', body: { text: 'Ausflug?', options: ['Wald', 'See'], plan: { kind: 'trip', date: '2026-11-15' } } });
    await api(`${f}/polls/${trip.post_id}/vote`, { token: mama, method: 'PUT', body: { option_id: trip.options[1].id } });
    await api(`${f}/polls/${trip.post_id}/close`, { token: mama, method: 'POST' });
    const [ev] = (await api(`${f}/events`, { token: mama })).data;
    assert.deepEqual([ev.title, ev.all_day, ev.start], ['See', true, '2026-11-15T00:00']);

    await api(`${f}/meals`, { token: mama, method: 'POST', body: { date: '2026-11-15', slot: 'lunch', title: 'Nudeln' } });
    const { data: meal } = await api(`${f}/polls`, { token: mama, method: 'POST', body: { text: 'Mittag?', options: ['Suppe', 'Reis'], plan: { kind: 'meal', date: '2026-11-15', slot: 'lunch' } } });
    await api(`${f}/polls/${meal.post_id}/vote`, { token: mama, method: 'PUT', body: { option_id: meal.options[0].id } });
    await api(`${f}/polls/${meal.post_id}/close`, { token: mama, method: 'POST' });
    assert.deepEqual((await api(`${f}/meals`, { token: mama })).data.map((m) => m.title), ['Suppe']);
    assert.equal((await api(`${f}/polls`, { token: mama, method: 'POST', body: { text: 'x', options: ['a', 'b'], plan: { kind: 'trip', date: '2026-11-15', start_time: '12:00', end_time: '11:00' } } })).status, 400);
  });
});

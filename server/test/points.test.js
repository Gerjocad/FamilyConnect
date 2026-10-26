import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { openDatabase } from '../src/db.js';

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

let n = 0;
async function family() {
  n += 1;
  const reg = async (name) => (await api('/auth/register', { method: 'POST', body: { name, email: `${name}${n}@punkte.test`, password: 'geheim123' } })).data.token;
  const mama = await reg('Mama');
  const lea = await reg('Lea');
  const tom = await reg('Tom');
  const { data: fam } = await api('/families', { token: mama, method: 'POST', body: { name: 'F' } });
  await api('/families/join', { token: lea, method: 'POST', body: { code: fam.invite_code } });
  const { data: joined } = await api('/families/join', { token: tom, method: 'POST', body: { code: fam.invite_code } });
  const id = (name) => joined.members.find((m) => m.name === name).id;
  return { mama, lea, tom, fid: fam.id, ids: { mama: id('Mama'), lea: id('Lea'), tom: id('Tom') } };
}

describe('Punkte & Belohnungen', () => {
  test('Testfunktionen: nur Admins dürfen sie für sich einschalten', async () => {
    const { mama, lea } = await family();
    assert.equal((await api('/me', { token: mama })).data.beta, false);
    assert.equal((await api('/me', { token: mama, method: 'PATCH', body: { beta: true } })).data.beta, true);
    assert.equal((await api('/me', { token: mama })).data.beta, true);
    assert.equal((await api('/me', { token: lea, method: 'PATCH', body: { beta: true } })).status, 403);
  });

  test('Punkte für Aufgaben, Gewohnheiten und Dienste – nur wenn eingeschaltet und nur für Sammler', async () => {
    const { mama, lea, fid, ids } = await family();
    const f = `/families/${fid}`;
    const points = async (token = mama) => (await api(`${f}/points`, { token })).data;
    const balance = async (userId) => (await points()).people.find((p) => p.user_id === userId).balance;

    const { data: task } = await api(`${f}/tasks`, { token: mama, method: 'POST', body: { title: 'Zimmer aufräumen', assignee_id: ids.lea } });
    await api(`${f}/tasks/${task.id}`, { token: lea, method: 'PATCH', body: { done: true } });
    assert.equal(await balance(ids.lea), 0, 'ausgeschaltet → keine Punkte');
    await api(`${f}/tasks/${task.id}`, { token: lea, method: 'PATCH', body: { done: false } });

    assert.equal((await api(`${f}/points/settings`, { token: lea, method: 'PUT', body: { enabled: true } })).status, 403);
    assert.equal((await api(`${f}/points/settings`, { token: mama, method: 'PUT', body: { enabled: true, task: 500 } })).status, 400);
    await api(`${f}/points/settings`, { token: mama, method: 'PUT', body: { enabled: true, task: 10 } });
    const overview = await points();
    assert.deepEqual(overview.people.map((p) => [p.user_id, p.collects]), [[ids.mama, false], [ids.lea, true], [ids.tom, true]], 'Kinder sammeln von selbst');

    // Aufgabe: abhaken = Punkte, wieder öffnen = weg, nochmal abhaken = nicht doppelt
    await api(`${f}/tasks/${task.id}`, { token: lea, method: 'PATCH', body: { done: true } });
    assert.equal(await balance(ids.lea), 10);
    await api(`${f}/tasks/${task.id}`, { token: lea, method: 'PATCH', body: { done: false } });
    assert.equal(await balance(ids.lea), 0);
    await api(`${f}/tasks/${task.id}`, { token: lea, method: 'PATCH', body: { done: true } });
    assert.equal(await balance(ids.lea), 10);

    // wiederkehrend: jedes Abhaken zählt
    const { data: weekly } = await api(`${f}/tasks`, { token: mama, method: 'POST', body: { title: 'Pflanzen gießen', assignee_id: ids.lea, due_date: '2026-10-20', recurrence: 'weekly' } });
    await api(`${f}/tasks/${weekly.id}`, { token: lea, method: 'PATCH', body: { done: true } });
    await api(`${f}/tasks/${weekly.id}`, { token: lea, method: 'PATCH', body: { done: true } });
    assert.equal(await balance(ids.lea), 30);

    // Gewohnheit (2 Punkte), rückgängig zieht wieder ab
    const { data: habit } = await api(`${f}/habits`, { token: mama, method: 'POST', body: { title: 'Zähne', emoji: '🦷', interval_days: 1 } });
    await api(`${f}/habits/${habit.id}/checkins`, { token: lea, method: 'POST', body: { date: '2026-10-25' } });
    await api(`${f}/habits/${habit.id}/checkins`, { token: lea, method: 'POST', body: { date: '2026-10-25' } });
    assert.equal(await balance(ids.lea), 32);
    await api(`${f}/habits/${habit.id}/checkins`, { token: lea, method: 'DELETE', body: { date: '2026-10-25' } });
    assert.equal(await balance(ids.lea), 30);

    // Dienst: Punkte bekommt, wer dran ist – auch wenn Mama abhakt
    const { data: chore } = await api(`${f}/chores`, { token: mama, method: 'POST', body: { title: 'Müll', start_date: '2026-10-20', interval_weeks: 1, member_ids: [ids.lea] } });
    await api(`${f}/chores/${chore.id}/days/2026-10-20/done`, { token: mama, method: 'POST' });
    assert.equal(await balance(ids.lea), 35);
    // Mama sammelt nicht
    await api(`${f}/habits/${habit.id}/checkins`, { token: mama, method: 'POST', body: { date: '2026-10-25' } });
    assert.equal(await balance(ids.mama), 0);

    const history = (await points(lea)).history;
    assert.deepEqual(history.map((h) => h.reason).slice(0, 2), ['Dienst: Müll', 'Aufgabe: Pflanzen gießen']);
    assert.ok(history.every((h) => h.user_id === ids.lea), 'Kinder sehen nur ihre eigenen Punkte');
    assert.equal((await points(lea)).people.length, 1);
  });

  test('Bonus, Belohnungen einlösen, genehmigen, ablehnen, zurückziehen', async () => {
    const { mama, lea, tom, fid, ids } = await family();
    const f = `/families/${fid}`;
    await api(`${f}/points/settings`, { token: mama, method: 'PUT', body: { enabled: true, released: true } });
    assert.equal((await api(`${f}/points/bonus`, { token: lea, method: 'POST', body: { user_id: ids.lea, amount: 100, reason: 'Ich' } })).status, 403);
    assert.equal((await api(`${f}/points/bonus`, { token: mama, method: 'POST', body: { user_id: ids.lea, amount: 50 } })).status, 400, 'Grund fehlt');
    assert.equal((await api(`${f}/points/bonus`, { token: mama, method: 'POST', body: { user_id: ids.lea, amount: 50, reason: 'Oma geholfen' } })).data.balance, 50);
    assert.equal(sent.at(-1)[1].title, '⭐ +50 Punkte');

    const { data: tablet } = await api(`${f}/points/rewards`, { token: mama, method: 'POST', body: { title: '30 Min. Tablet', emoji: '📱', cost: 20 } });
    const { data: kino } = await api(`${f}/points/rewards`, { token: mama, method: 'POST', body: { title: 'Kino', emoji: '🎬', cost: 200 } });
    assert.equal((await api(`${f}/points/rewards`, { token: lea, method: 'POST', body: { title: 'X', cost: 1 } })).status, 403);

    const fehlt = await api(`${f}/points/rewards/${kino.id}/redeem`, { token: lea, method: 'POST' });
    assert.equal(fehlt.status, 400);
    assert.match(fehlt.data.error, /150 Punkte/);
    const { data: r1 } = await api(`${f}/points/rewards/${tablet.id}/redeem`, { token: lea, method: 'POST' });
    assert.equal(r1.status, 'pending');
    assert.equal(sent.at(-1)[1].title, '📱 Lea möchte einlösen');
    assert.deepEqual(sent.at(-1)[0], [ids.mama]);
    const { data: r2 } = await api(`${f}/points/rewards/${tablet.id}/redeem`, { token: lea, method: 'POST' });
    assert.equal((await api(`${f}/points/rewards/${tablet.id}/redeem`, { token: lea, method: 'POST' })).status, 400, '2×20 vorgemerkt, nur noch 10 frei');

    assert.equal((await api(`${f}/points/redemptions/${r1.id}/approve`, { token: lea, method: 'POST' })).status, 403);
    assert.equal((await api(`${f}/points/redemptions/${r1.id}/approve`, { token: mama, method: 'POST' })).data.status, 'approved');
    assert.equal(sent.at(-1)[1].title, '📱 Eingelöst: 30 Min. Tablet');
    assert.equal((await api(`${f}/points/redemptions/${r1.id}/decline`, { token: mama, method: 'POST' })).status, 404, 'schon entschieden');
    assert.equal((await api(`${f}/points/redemptions/${r2.id}/cancel`, { token: tom, method: 'POST' })).status, 403);
    assert.equal((await api(`${f}/points/redemptions/${r2.id}/cancel`, { token: lea, method: 'POST' })).data.status, 'cancelled');

    const lea_ = (await api(`${f}/points`, { token: mama })).data.people.find((p) => p.user_id === ids.lea);
    assert.deepEqual([lea_.balance, lea_.reserved, lea_.week], [30, 0, 50]);

    // Belohnung entfernen → verschwindet aus der Liste, Einlösung behält den Namen
    await api(`${f}/points/rewards/${tablet.id}`, { token: mama, method: 'DELETE' });
    const after = (await api(`${f}/points`, { token: lea })).data;
    assert.deepEqual(after.rewards.map((r) => r.title), ['Kino']);
    assert.equal(after.redemptions.find((r) => r.id === r1.id).title, '30 Min. Tablet');

    // Wer sammelt: Tom raus
    await api(`${f}/points/settings`, { token: mama, method: 'PUT', body: { collectors: [ids.lea] } });
    assert.equal((await api(`${f}/points/rewards/${kino.id}/redeem`, { token: tom, method: 'POST' })).status, 403);
  });
});

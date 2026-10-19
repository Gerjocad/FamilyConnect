import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { occurrenceIndex } from '../src/chores.js';
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
    method: 'POST', body: { name, email: `${name}${n}@dienst.test`, password: 'geheim123' },
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

describe('Dienste', () => {
  test('Termine im Abstand von n Wochen', () => {
    const chore = { start_date: '2026-10-20', interval_weeks: 2 };
    assert.equal(occurrenceIndex(chore, '2026-10-20'), 0);
    assert.equal(occurrenceIndex(chore, '2026-11-03'), 1);
    assert.equal(occurrenceIndex(chore, '2026-10-27'), -1, 'Zwischenwoche');
    assert.equal(occurrenceIndex(chore, '2026-10-13'), -1, 'vor dem Start');
    // über die Zeitumstellung hinweg (25.10.)
    assert.equal(occurrenceIndex({ start_date: '2026-10-20', interval_weeks: 1 }, '2026-10-27'), 1);
  });

  test('feste Termine aus dem Abfallkalender', async () => {
    const { mama, tom, fid, ids } = await family();
    const { data: chore } = await api(`/families/${fid}/chores`, { token: mama, method: 'POST', body: {
      title: 'Papier', emoji: '📰', start_date: '2026-01-01', interval_weeks: 1, member_ids: [ids.tom],
      dates: ['2026-12-24', '2026-12-18', '2026-12-18'],
    } });
    assert.deepEqual(chore.dates, ['2026-12-18', '2026-12-24'], 'sortiert, ohne Doppelte');
    assert.equal(chore.start_date, '2026-12-18', 'Start = erster Termin');
    const day = (date) => `/families/${fid}/chores/${chore.id}/days/${date}/done`;
    assert.equal((await api(day('2026-12-25'), { token: tom, method: 'POST' })).status, 400, 'Feiertag – kein Termin');
    assert.equal((await api(day('2026-12-24'), { token: tom, method: 'POST' })).status, 204);
    assert.equal(occurrenceIndex({ dates: '["2026-12-18","2026-12-24"]' }, '2026-12-24'), 1);
  });

  test('nur Eltern legen an; abhaken nur wer dran ist; tauschen', async () => {
    const { mama, tom, lea, fid, ids } = await family();
    const body = { title: 'Gelber Sack', emoji: '♻️', start_date: '2026-10-20', interval_weeks: 2, member_ids: [ids.tom, ids.lea] };
    assert.equal((await api(`/families/${fid}/chores`, { token: tom, method: 'POST', body })).status, 403);
    const { status, data: chore } = await api(`/families/${fid}/chores`, { token: mama, method: 'POST', body });
    assert.equal(status, 201);
    assert.equal(chore.remind, 'evening');
    assert.deepEqual(chore.member_ids, [ids.tom, ids.lea], 'Reihenfolge bleibt');
    const day = (date) => `/families/${fid}/chores/${chore.id}/days/${date}`;

    // 20.10. → Tom, 03.11. → Lea
    assert.equal((await api(`${day('2026-10-27')}/done`, { token: tom, method: 'POST' })).status, 400, 'kein Termin');
    assert.equal((await api(`${day('2026-10-20')}/done`, { token: lea, method: 'POST' })).status, 403, 'Lea ist nicht dran');
    assert.equal((await api(`${day('2026-10-20')}/done`, { token: tom, method: 'POST' })).status, 204);
    assert.equal((await api(`${day('2026-11-03')}/done`, { token: mama, method: 'POST' })).status, 204, 'Eltern dürfen immer');
    // Lea gibt ihren Termin an Tom ab – danach darf nur noch Tom abhaken
    await api(`${day('2026-11-03')}/done`, { token: mama, method: 'DELETE' });
    assert.equal((await api(`${day('2026-11-03')}/assign`, { token: tom, method: 'POST', body: { user_id: ids.tom } })).status, 403, 'nur wer dran ist');
    assert.equal((await api(`${day('2026-11-03')}/assign`, { token: lea, method: 'POST', body: { user_id: ids.tom } })).status, 204);
    assert.equal((await api(`${day('2026-11-03')}/done`, { token: lea, method: 'POST' })).status, 403);
    assert.equal((await api(`${day('2026-11-03')}/done`, { token: tom, method: 'POST' })).status, 204);

    const { data: days } = await api(`/families/${fid}/chore-days?since=2026-10-01`, { token: lea });
    assert.deepEqual(days.map((d) => [d.date, d.assignee_id, d.done_by]), [
      ['2026-10-20', null, ids.tom],
      ['2026-11-03', ids.tom, ids.tom],
    ]);

    // Löschen räumt die Ausnahmen mit auf
    assert.equal((await api(`/families/${fid}/chores/${chore.id}`, { token: mama, method: 'DELETE' })).status, 204);
    assert.deepEqual((await api(`/families/${fid}/chore-days`, { token: lea })).data, []);
  });
});

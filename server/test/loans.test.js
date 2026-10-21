import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { openDatabase } from '../src/db.js';
import { checkLoanReminders } from '../src/loans.js';

let server;
let base;
let db;
before(async () => {
  db = openDatabase(':memory:');
  const app = createApp(db);
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

describe('Ausgeliehen', () => {
  test('eintragen, Kinder-Regeln, Erinnerungen', async () => {
    const reg = async (name) => (await api('/auth/register', { method: 'POST', body: { name, email: `${name}@leih.test`, password: 'geheim123' } })).data.token;
    const mama = await reg('Mama');
    const lea = await reg('Lea');
    const tom = await reg('Tom');
    const { data: fam } = await api('/families', { token: mama, method: 'POST', body: { name: 'F' } });
    await api('/families/join', { token: lea, method: 'POST', body: { code: fam.invite_code } });
    const { data: joined } = await api('/families/join', { token: tom, method: 'POST', body: { code: fam.invite_code } });
    const ids = Object.fromEntries(joined.members.map((m) => [m.name, m.id]));
    const path = `/families/${fam.id}/loans`;

    assert.equal((await api(path, { token: lea, method: 'POST', body: { title: 'Gregs Tagebuch' } })).status, 400, 'Rückgabedatum fehlt');
    const { status, data: book } = await api(path, { token: lea, method: 'POST', body: { title: 'Gregs Tagebuch', member_id: ids.Lea, lender: 'Stadtbücherei', due_date: '2026-10-22' } });
    assert.equal(status, 201);
    assert.equal(book.returned, false);
    assert.equal((await api(path, { token: lea, method: 'POST', body: { title: 'X', member_id: ids.Tom, due_date: '2026-10-22' } })).status, 403, 'nur für sich');
    assert.equal((await api(`${path}/${book.id}`, { token: tom, method: 'PATCH', body: { returned: true } })).status, 403, 'fremde Ausleihe');
    // Mama trägt für Lea ein – Lea darf es trotzdem als zurückgegeben markieren
    const { data: second } = await api(path, { token: mama, method: 'POST', body: { title: 'Die drei ???', member_id: ids.Lea, due_date: '2026-10-21' } });
    assert.equal((await api(`${path}/${second.id}`, { token: lea, method: 'PATCH', body: { due_date: '2026-11-11' } })).data.due_date, '2026-11-11');

    const sent = [];
    const push = { notify: (ids2, m) => sent.push([ids2, m]) };
    checkLoanReminders(db, push, new Date(2026, 9, 21, 6, 0));
    assert.equal(sent.length, 0, 'vor 7 Uhr nichts');
    checkLoanReminders(db, push, new Date(2026, 9, 21, 17, 30));
    assert.deepEqual(sent, [[[ids.Lea], { title: '📚 Morgen zurückgeben', body: 'Gregs Tagebuch (Stadtbücherei)', path: '/ausgeliehen' }]]);
    checkLoanReminders(db, push, new Date(2026, 9, 21, 18, 0));
    assert.equal(sent.length, 1, 'nur einmal');
    checkLoanReminders(db, push, new Date(2026, 9, 22, 7, 5));
    assert.equal(sent.at(-1)[1].title, '📚 Heute zurückgeben');
    await api(`${path}/${book.id}`, { token: lea, method: 'PATCH', body: { returned: true } });
    db.prepare("UPDATE loans SET reminded = '' WHERE id = ?").run(book.id);
    checkLoanReminders(db, push, new Date(2026, 9, 22, 8, 0));
    assert.equal(sent.length, 2, 'zurückgegeben → keine Erinnerung');
  });
});

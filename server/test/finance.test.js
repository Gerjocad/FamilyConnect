import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { openDatabase } from '../src/db.js';
import { splitShared } from '../src/finance.js';

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

// Anna verdient 3000 €, Ben 2000 €; Anna hat 500 € eigene Ausgaben, Ben 1000 €. Gemeinsam 2000 € Kosten, 250 € Kindergeld.
const people = [{ id: 1, income: 300_000, expenses: 50_000 }, { id: 2, income: 200_000, expenses: 100_000 }];
const split = (method, extra = {}) => splitShared({ people, sharedIncome: 25_000, sharedExpenses: 200_000, method, ...extra });
const transfers = (r) => r.people.map((p) => p.transfer);

describe('Aufteilung', () => {
  test('nach Einkommen, nach Verfügbarem, gleicher Rest, halbe-halbe', () => {
    assert.deepEqual(transfers(split('income')), [105_000, 70_000]);
    // frei: 2500 € und 1000 € → 5/7 und 2/7 von 1750 €
    assert.deepEqual(transfers(split('available')), [125_000, 50_000]);
    // beiden bleiben je 875 €
    const same = split('same_rest');
    assert.deepEqual(transfers(same), [162_500, 12_500]);
    assert.deepEqual(same.people.map((p) => p.remaining), [87_500, 87_500]);
    assert.deepEqual(transfers(split('equal')), [87_500, 87_500]);
    assert.equal(split('income').need, 175_000);
    assert.equal(split('income').balance, 0);
  });

  test('gleicher Rest zahlt nie weniger als 0', () => {
    const r = splitShared({
      people: [{ id: 1, income: 400_000, expenses: 0 }, { id: 2, income: 50_000, expenses: 40_000 }],
      sharedIncome: 0, sharedExpenses: 100_000, method: 'same_rest',
    });
    assert.deepEqual(transfers(r), [100_000, 0]);
  });

  test('Puffer und Aufrunden', () => {
    const r = split('income', { bufferPercent: 10, roundTo: 50 });
    // 1925 € Bedarf → 1155 € und 770 € → aufgerundet 1200 € und 800 €
    assert.equal(r.need, 192_500);
    assert.deepEqual(transfers(r), [120_000, 80_000]);
    assert.equal(r.balance, 25_000);
  });

  test('ohne Einkommen gleich verteilt, ohne Bedarf nichts', () => {
    const none = [{ id: 1, income: 0, expenses: 0 }, { id: 2, income: 0, expenses: 0 }];
    assert.deepEqual(transfers(splitShared({ people: none, sharedIncome: 0, sharedExpenses: 1000, method: 'income' })), [500, 500]);
    assert.deepEqual(transfers(splitShared({ people, sharedIncome: 5000, sharedExpenses: 1000, method: 'same_rest' })), [0, 0]);
  });
});

describe('Finanzen-API', () => {
  test('Einträge, Rechte, Einstellungen', async () => {
    const reg = async (name) => (await api('/auth/register', { method: 'POST', body: { name, email: `${name}@geld.test`, password: 'geheim123' } })).data.token;
    const anna = await reg('Anna');
    const ben = await reg('Ben');
    const kind = await reg('Kind');
    const { data: fam } = await api('/families', { token: anna, method: 'POST', body: { name: 'F' } });
    await api('/families/join', { token: ben, method: 'POST', body: { code: fam.invite_code } });
    const { data: joined } = await api('/families/join', { token: kind, method: 'POST', body: { code: fam.invite_code } });
    const ids = Object.fromEntries(joined.members.map((m) => [m.name, m.id]));
    await api(`/families/${fam.id}/members/${ids.Ben}`, { token: anna, method: 'PATCH', body: { role: 'parent' } });
    const path = `/families/${fam.id}/finance`;

    assert.equal((await api(path, { token: kind })).status, 403, 'Kinder sehen keine Finanzen');
    assert.equal((await api(`${path}/entries`, { token: anna, method: 'POST', body: { kind: 'income', title: 'Gehalt', amount: 12.5 } })).status, 400);

    const add = (token, body) => api(`${path}/entries`, { token, method: 'POST', body });
    assert.equal((await add(anna, { owner_id: ids.Anna, kind: 'income', title: 'Gehalt', amount: 300_000 })).status, 201);
    await add(ben, { owner_id: ids.Ben, kind: 'income', title: 'Gehalt', amount: 200_000 });
    await add(ben, { owner_id: ids.Ben, kind: 'expense', title: 'Handy', amount: 3_000 });
    const { data: rent } = await add(anna, { kind: 'expense', title: 'Miete', amount: 100_000, category: 'Wohnen' });
    // Jahresbeitrag → 50 € im Monat
    await add(anna, { kind: 'expense', title: 'Versicherung', amount: 60_000, interval_months: 12 });

    const { data } = await api(path, { token: ben });
    assert.equal(data.entries.length, 5);
    assert.deepEqual(data.settings.participants, [ids.Anna, ids.Ben], 'Erwachsene zahlen ein');
    assert.deepEqual(data.shared, { income: 0, expenses: 105_000 });
    assert.deepEqual(transfers(data.results.income), [63_000, 42_000]);

    assert.equal((await api(`${path}/entries/${rent.id}`, { token: ben, method: 'PATCH', body: { amount: 110_000 } })).data.amount, 110_000);
    const { data: changed } = await api(`${path}/settings`, { token: anna, method: 'PUT', body: { method: 'equal', round_to: 50 } });
    assert.equal(changed.settings.method, 'equal');
    assert.deepEqual(transfers(changed.results.equal), [60_000, 60_000]);
    assert.equal((await api(`${path}/settings`, { token: anna, method: 'PUT', body: { method: 'quatsch' } })).status, 400);
    assert.equal((await api(`${path}/entries/${rent.id}`, { token: kind, method: 'DELETE' })).status, 403);
    assert.equal((await api(`${path}/entries/${rent.id}`, { token: anna, method: 'DELETE' })).status, 204);
  });
});

import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { openDatabase } from '../src/db.js';
import { calculate } from '../src/finance.js';

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

describe('Finanzen: Berechnung', () => {
  const people = [{ id: 1 }, { id: 2 }];
  const e = (owner_id, kind, amount, interval = 'monthly') => ({ owner_id, kind, amount, interval });
  const entries = [
    e(null, 'expense', 120000), e(null, 'expense', 120000, 'yearly'), e(null, 'income', 25500),
    e(1, 'income', 300000), e(2, 'income', 200000), e(1, 'expense', 150000), e(2, 'adjustment', 5000),
  ];

  test('nach Einkommen: 60/40, Kindergeld zieht ab, Zuschlag obendrauf', () => {
    const r = calculate(entries, people, { mode: 'income', shares: {} });
    assert.equal(r.shared_expenses, 130000, 'jährlich ÷ 12');
    assert.equal(r.needed, 104500);
    assert.deepEqual(r.people.map((p) => [p.part, p.transfer]), [[62700, 62700], [41800, 46800]]);
    assert.equal(r.people[0].left, 300000 - 150000 - 62700);
  });

  test('nach Rest und mit eigenen Prozenten; Summe stimmt auf den Cent', () => {
    const rest = calculate(entries, people, { mode: 'remaining', shares: {} });
    assert.deepEqual(rest.people.map((p) => Math.round(p.share * 100)), [43, 57]);
    assert.equal(rest.people[0].part + rest.people[1].part, rest.needed);
    const custom = calculate(entries, people, { mode: 'custom', shares: { 1: 50, 2: 50 } });
    assert.deepEqual(custom.people.map((p) => p.part), [52250, 52250]);
    const empty = calculate([e(null, 'expense', 1001)], people, { mode: 'income', shares: {} });
    assert.deepEqual(empty.people.map((p) => p.part), [501, 500], 'ohne Einkommen halb/halb');
  });
});

describe('Finanzen: API', () => {
  test('nur Eltern/Admins, private Ausgaben nur für sich', async () => {
    const reg = async (name) => (await api('/auth/register', { method: 'POST', body: { name, email: `${name}@geld.test`, password: 'geheim123' } })).data.token;
    const mama = await reg('Mama');
    const papa = await reg('Papa');
    const lea = await reg('Lea');
    const { data: fam } = await api('/families', { token: mama, method: 'POST', body: { name: 'F' } });
    await api('/families/join', { token: papa, method: 'POST', body: { code: fam.invite_code } });
    const { data: joined } = await api('/families/join', { token: lea, method: 'POST', body: { code: fam.invite_code } });
    const id = (n) => joined.members.find((m) => m.name === n).id;
    await api(`/families/${fam.id}/members/${id('Papa')}`, { token: mama, method: 'PATCH', body: { role: 'parent' } });
    const f = `/families/${fam.id}/finance`;

    assert.equal((await api(f, { token: lea })).status, 403);
    const { data: state } = await api(f, { token: papa });
    assert.deepEqual(state.people.map((p) => p.name), ['Mama', 'Papa'], 'Kinder zählen nicht mit');

    const add = (token, body) => api(`${f}/entries`, { token, method: 'POST', body });
    assert.equal((await add(mama, { owner_id: null, kind: 'adjustment', title: 'x', amount: 100, interval: 'monthly' })).status, 400);
    assert.equal((await add(mama, { owner_id: id('Lea'), kind: 'income', title: 'x', amount: 100, interval: 'monthly' })).status, 400);
    assert.equal((await add(mama, { owner_id: null, kind: 'expense', title: 'Miete', amount: -5, interval: 'monthly' })).status, 400);
    await add(mama, { owner_id: null, kind: 'expense', title: 'Miete', amount: 100000, interval: 'monthly' });
    await add(mama, { owner_id: id('Mama'), kind: 'income', title: 'Gehalt', amount: 300000, interval: 'monthly' });
    await add(papa, { owner_id: id('Papa'), kind: 'income', title: 'Gehalt', amount: 100000, interval: 'monthly' });
    const { data: secret } = await add(mama, { owner_id: id('Mama'), kind: 'expense', title: 'Geschenk für Papa', amount: 9000, interval: 'monthly', private: true });
    assert.equal(secret.private, true);
    const { data: extra } = await add(papa, { owner_id: id('Papa'), kind: 'adjustment', title: 'Tankgeld', amount: -2000, interval: 'monthly' });
    assert.equal(extra.amount, -2000, 'Abschläge dürfen negativ sein');

    const { data: forPapa } = await api(f, { token: papa });
    assert.ok(!forPapa.entries.some((e) => e.title === 'Geschenk für Papa'), 'privat bleibt privat');
    assert.equal((await api(`${f}/entries/${secret.id}`, { token: papa, method: 'DELETE' })).status, 404);
    assert.deepEqual(forPapa.summary.people.map((p) => [p.part, p.transfer]), [[75000, 75000], [25000, 23000]]);

    assert.equal((await api(`${f}/settings`, { token: papa, method: 'PUT', body: { mode: 'quatsch' } })).status, 400);
    await api(`${f}/settings`, { token: papa, method: 'PUT', body: { mode: 'custom', shares: { [id('Mama')]: 50, [id('Papa')]: 50 } } });
    const { data: after50 } = await api(f, { token: mama });
    assert.equal(after50.settings.mode, 'custom');
    assert.deepEqual(after50.summary.people.map((p) => p.part), [50000, 50000]);
    await api(`${f}/entries/${extra.id}`, { token: mama, method: 'PATCH', body: { amount: 3000 } });
    assert.equal((await api(f, { token: mama })).data.summary.people[1].transfer, 53000);
  });
});

import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { openDatabase } from '../src/db.js';

let server;
let base;

before(async () => {
  const app = createApp(openDatabase(':memory:'));
  await new Promise((resolve) => {
    server = app.listen(0, resolve);
  });
  base = `http://127.0.0.1:${server.address().port}/api`;
});

after(() => server.close());

async function api(path, { token, method = 'GET', body } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: {
      ...(body !== undefined && { 'Content-Type': 'application/json' }),
      ...(token && { Authorization: `Bearer ${token}` }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = res.status === 204 ? null : await res.json();
  return { status: res.status, data };
}

let counter = 0;
async function register(name = 'Anna') {
  counter += 1;
  const { status, data } = await api('/auth/register', {
    method: 'POST',
    body: { name, email: `${name.toLowerCase()}${counter}@example.com`, password: 'geheim123' },
  });
  assert.equal(status, 201);
  return data.token;
}

async function familyWithTwoMembers() {
  const anna = await register('Anna');
  const ben = await register('Ben');
  const { data: family } = await api('/families', { token: anna, method: 'POST', body: { name: 'Müller' } });
  await api('/families/join', { token: ben, method: 'POST', body: { code: family.invite_code } });
  const { data: details } = await api(`/families/${family.id}`, { token: anna });
  return { anna, ben, family: details };
}

describe('Konto', () => {
  test('Registrierung, Login und Logout', async () => {
    await api('/auth/register', {
      method: 'POST',
      body: { name: 'Clara', email: 'clara@example.com', password: 'geheim123' },
    });
    const dup = await api('/auth/register', {
      method: 'POST',
      body: { name: 'Clara', email: 'CLARA@example.com', password: 'geheim123' },
    });
    assert.equal(dup.status, 409);

    const wrong = await api('/auth/login', { method: 'POST', body: { email: 'clara@example.com', password: 'falsch' } });
    assert.equal(wrong.status, 401);

    const { data } = await api('/auth/login', { method: 'POST', body: { email: 'Clara@example.com', password: 'geheim123' } });
    const me = await api('/me', { token: data.token });
    assert.equal(me.data.name, 'Clara');
    assert.deepEqual(me.data.families, []);

    await api('/auth/logout', { token: data.token, method: 'POST' });
    assert.equal((await api('/me', { token: data.token })).status, 401);
  });

  test('lehnt kurze Passwörter ab', async () => {
    const res = await api('/auth/register', { method: 'POST', body: { name: 'X', email: 'x@example.com', password: 'kurz' } });
    assert.equal(res.status, 400);
  });
});

describe('Familien', () => {
  test('Beitritt per Einladungscode', async () => {
    const { family } = await familyWithTwoMembers();
    assert.equal(family.members.length, 2);
    assert.deepEqual(family.members.map((m) => m.role), ['admin', 'member']);
    assert.notEqual(family.members[0].color, family.members[1].color);
  });

  test('Fremde haben keinen Zugriff', async () => {
    const { family } = await familyWithTwoMembers();
    const stranger = await register('Eve');
    assert.equal((await api(`/families/${family.id}`, { token: stranger })).status, 403);
    assert.equal((await api(`/families/${family.id}/tasks`, { token: stranger })).status, 403);
  });

  test('beim Verlassen wird ein neuer Admin bestimmt', async () => {
    const { anna, ben, family } = await familyWithTwoMembers();
    await api(`/families/${family.id}/leave`, { token: anna, method: 'POST' });
    const { data } = await api(`/families/${family.id}`, { token: ben });
    assert.deepEqual(data.members.map((m) => [m.name, m.role]), [['Ben', 'admin']]);
  });
});

describe('Familien-Inhalte', () => {
  test('Termine: anlegen, ändern, validieren', async () => {
    const { anna, family } = await familyWithTwoMembers();
    const ids = family.members.map((m) => m.id);
    const created = await api(`/families/${family.id}/events`, {
      token: anna,
      method: 'POST',
      body: { title: 'Elternabend', start: '2026-10-20T19:00', end: '2026-10-20T20:30', member_ids: ids },
    });
    assert.equal(created.status, 201);
    assert.deepEqual(created.data.member_ids, ids);
    assert.equal(created.data.all_day, false);
    assert.equal(created.data.recurrence, 'none');

    const patched = await api(`/families/${family.id}/events/${created.data.id}`, {
      token: anna, method: 'PATCH', body: { recurrence: 'weekly' },
    });
    assert.equal(patched.data.recurrence, 'weekly');
    assert.equal(patched.data.title, 'Elternabend');

    const backwards = await api(`/families/${family.id}/events`, {
      token: anna, method: 'POST', body: { title: 'X', start: '2026-10-20T19:00', end: '2026-10-20T18:00' },
    });
    assert.equal(backwards.status, 400);

    const outsider = await api(`/families/${family.id}/events`, {
      token: anna, method: 'POST', body: { title: 'X', start: '2026-10-20T19:00', end: '2026-10-20T19:00', member_ids: [9999] },
    });
    assert.equal(outsider.status, 400);
  });

  test('Listen und Einträge', async () => {
    const { anna, ben, family } = await familyWithTwoMembers();
    const { data: list } = await api(`/families/${family.id}/lists`, { token: anna, method: 'POST', body: { name: 'Einkauf' } });
    const { data: item } = await api(`/families/${family.id}/items`, {
      token: ben, method: 'POST', body: { list_id: list.id, text: 'Milch', quantity: '2 l' },
    });
    await api(`/families/${family.id}/items/${item.id}`, { token: anna, method: 'PATCH', body: { done: true } });
    const { data: items } = await api(`/families/${family.id}/items`, { token: ben });
    assert.equal(items.length, 1);
    assert.equal(items[0].done, true);

    await api(`/families/${family.id}/lists/${list.id}`, { token: anna, method: 'DELETE' });
    assert.deepEqual((await api(`/families/${family.id}/items`, { token: ben })).data, []);
  });

  test('Einträge können nicht in fremde Listen geschrieben werden', async () => {
    const a = await familyWithTwoMembers();
    const b = await familyWithTwoMembers();
    const { data: list } = await api(`/families/${a.family.id}/lists`, { token: a.anna, method: 'POST', body: { name: 'Geheim' } });
    const res = await api(`/families/${b.family.id}/items`, {
      token: b.anna, method: 'POST', body: { list_id: list.id, text: 'Hack' },
    });
    assert.equal(res.status, 400);
  });

  test('Aufgaben mit Zuständigkeit', async () => {
    const { anna, ben, family } = await familyWithTwoMembers();
    const benId = family.members.find((m) => m.name === 'Ben').id;
    const { data: task } = await api(`/families/${family.id}/tasks`, {
      token: anna, method: 'POST', body: { title: 'Müll rausbringen', assignee_id: benId, due_date: '2026-10-18' },
    });
    assert.equal(task.assignee_id, benId);
    const bad = await api(`/families/${family.id}/tasks`, {
      token: anna, method: 'POST', body: { title: 'X', due_date: '2026-02-30' },
    });
    assert.equal(bad.status, 400);

    await api(`/families/${family.id}/leave`, { token: ben, method: 'POST' });
    const { data: tasks } = await api(`/families/${family.id}/tasks`, { token: anna });
    assert.equal(tasks[0].assignee_id, null);
  });

  test('Pinnwand: nur der Autor darf bearbeiten, Admin darf löschen', async () => {
    const { anna, ben, family } = await familyWithTwoMembers();
    const { data: post } = await api(`/families/${family.id}/posts`, { token: ben, method: 'POST', body: { text: 'Hallo!' } });
    const { data: annaPost } = await api(`/families/${family.id}/posts`, { token: anna, method: 'POST', body: { text: 'Hi Ben' } });
    assert.equal((await api(`/families/${family.id}/posts/${annaPost.id}`, { token: ben, method: 'DELETE' })).status, 403);
    assert.equal((await api(`/families/${family.id}/posts/${post.id}`, { token: anna, method: 'DELETE' })).status, 204);
  });

  test('Essensplan: pro Tag und Mahlzeit nur ein Eintrag', async () => {
    const { anna, family } = await familyWithTwoMembers();
    const body = { date: '2026-10-19', slot: 'dinner', title: 'Spaghetti' };
    assert.equal((await api(`/families/${family.id}/meals`, { token: anna, method: 'POST', body })).status, 201);
    assert.equal((await api(`/families/${family.id}/meals`, { token: anna, method: 'POST', body })).status, 409);
  });

  test('Kontakte sind nach Namen sortiert', async () => {
    const { anna, family } = await familyWithTwoMembers();
    for (const name of ['Zahnarzt Dr. Weiß', 'babysitterin Lea', 'Kinderarzt']) {
      await api(`/families/${family.id}/contacts`, { token: anna, method: 'POST', body: { name } });
    }
    const { data } = await api(`/families/${family.id}/contacts`, { token: anna });
    assert.deepEqual(data.map((c) => c.name), ['babysitterin Lea', 'Kinderarzt', 'Zahnarzt Dr. Weiß']);
  });
});

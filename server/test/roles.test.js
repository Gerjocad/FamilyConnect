import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
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
/** Admin (Papa), Mama und Kind – Mama wird vom Admin zu Eltern gemacht */
async function family() {
  n += 1;
  const reg = async (name) => (await api('/auth/register', {
    method: 'POST', body: { name, email: `${name}${n}@rollen.test`, password: 'geheim123' },
  })).data.token;
  const papa = await reg('Papa');
  const mama = await reg('Mama');
  const kind = await reg('Kind');
  const { data: fam } = await api('/families', { token: papa, method: 'POST', body: { name: 'F' } });
  await api('/families/join', { token: mama, method: 'POST', body: { code: fam.invite_code } });
  const { data: joined } = await api('/families/join', { token: kind, method: 'POST', body: { code: fam.invite_code } });
  const id = (name) => joined.members.find((m) => m.name === name).id;
  const ids = { papa: id('Papa'), mama: id('Mama'), kind: id('Kind') };
  const { status } = await api(`/families/${fam.id}/members/${ids.mama}`, { token: papa, method: 'PATCH', body: { role: 'parent' } });
  assert.equal(status, 200);
  return { papa, mama, kind, fid: fam.id, ids };
}

describe('Rollen', () => {
  test('neue Mitglieder sind Kinder, nur der Admin vergibt Rollen und entfernt Mitglieder', async () => {
    const { papa, mama, kind, fid, ids } = await family();
    const { data } = await api(`/families/${fid}`, { token: kind });
    assert.deepEqual(data.members.map((m) => [m.name, m.role]), [['Papa', 'admin'], ['Mama', 'parent'], ['Kind', 'child']]);

    const roleOf = (token, userId, role) => api(`/families/${fid}/members/${userId}`, { token, method: 'PATCH', body: { role } });
    assert.equal((await roleOf(mama, ids.kind, 'parent')).status, 403, 'Eltern vergeben keine Rollen');
    assert.equal((await roleOf(kind, ids.kind, 'admin')).status, 403, 'Kind macht sich nicht zum Admin');
    assert.equal((await roleOf(papa, ids.kind, 'chef')).status, 400);
    assert.equal((await roleOf(papa, ids.papa, 'parent')).status, 400, 'letzter Admin bleibt Admin');
    // Zweiter Admin → dann darf der erste zurücktreten
    assert.equal((await roleOf(papa, ids.mama, 'admin')).status, 200);
    assert.equal((await roleOf(papa, ids.papa, 'parent')).status, 200);

    assert.equal((await api(`/families/${fid}`, { token: papa, method: 'PATCH', body: { name: 'X' } })).status, 403, 'Eltern benennen nicht um');
    assert.equal((await api(`/families/${fid}/members/${ids.kind}`, { token: papa, method: 'DELETE' })).status, 403);
    const removed = await api(`/families/${fid}/members/${ids.kind}`, { token: mama, method: 'DELETE' });
    assert.equal(removed.status, 200);
    assert.equal(removed.data.members.length, 2);
    assert.equal((await api(`/families/${fid}/tasks`, { token: kind })).status, 403, 'entfernt = kein Zugriff mehr');
    assert.equal((await api(`/families/${fid}/members/${ids.mama}`, { token: mama, method: 'DELETE' })).status, 400, 'sich selbst nur per Verlassen');
  });

  test('Kinder: Aufgaben nur für sich, fremde nur abhaken', async () => {
    const { mama, kind, fid, ids } = await family();
    const tasks = `/families/${fid}/tasks`;
    assert.equal((await api(tasks, { token: kind, method: 'POST', body: { title: 'Für Mama', assignee_id: ids.mama } })).status, 403);
    assert.equal((await api(tasks, { token: kind, method: 'POST', body: { title: 'Für alle' } })).status, 403);
    const own = await api(tasks, { token: kind, method: 'POST', body: { title: 'Lernen', assignee_id: ids.kind } });
    assert.equal(own.status, 201);
    assert.equal((await api(`${tasks}/${own.data.id}`, { token: kind, method: 'PATCH', body: { title: 'Vokabeln lernen' } })).status, 200);
    assert.equal((await api(`${tasks}/${own.data.id}`, { token: kind, method: 'PATCH', body: { assignee_id: ids.mama } })).status, 403);

    const forKid = (await api(tasks, { token: mama, method: 'POST', body: { title: 'Zimmer aufräumen', assignee_id: ids.kind } })).data;
    const forAll = (await api(tasks, { token: mama, method: 'POST', body: { title: 'Müll rausbringen' } })).data;
    const forMama = (await api(tasks, { token: mama, method: 'POST', body: { title: 'Steuer', assignee_id: ids.mama } })).data;
    assert.equal((await api(`${tasks}/${forKid.id}`, { token: kind, method: 'PATCH', body: { done: true } })).status, 200);
    assert.equal((await api(`${tasks}/${forAll.id}`, { token: kind, method: 'PATCH', body: { done: true } })).status, 200);
    assert.equal((await api(`${tasks}/${forMama.id}`, { token: kind, method: 'PATCH', body: { done: true } })).status, 403);
    assert.equal((await api(`${tasks}/${forKid.id}`, { token: kind, method: 'PATCH', body: { title: 'Nix tun' } })).status, 403);
    assert.equal((await api(`${tasks}/${forKid.id}`, { token: kind, method: 'DELETE' })).status, 403);
    assert.equal((await api(`${tasks}/${own.data.id}`, { token: kind, method: 'DELETE' })).status, 204);
    // Eltern dürfen alles, auch Sachen der Kinder
    const kidTask = (await api(tasks, { token: kind, method: 'POST', body: { title: 'Lesen', assignee_id: ids.kind } })).data;
    assert.equal((await api(`${tasks}/${kidTask.id}`, { token: mama, method: 'DELETE' })).status, 204);
  });

  test('Kinder: eigene Termine und Listen, keine Gewohnheiten; Essen, Rezepte, Kontakte frei', async () => {
    const { mama, kind, fid, ids } = await family();
    const event = { title: 'Arzt', start: '2026-11-02T10:00', end: '2026-11-02T11:00' };
    const mamas = (await api(`/families/${fid}/events`, { token: mama, method: 'POST', body: event })).data;
    const kids = await api(`/families/${fid}/events`, { token: kind, method: 'POST', body: { ...event, title: 'Fußball' } });
    assert.equal(kids.status, 201);
    assert.equal((await api(`/families/${fid}/events/${kids.data.id}`, { token: kind, method: 'PATCH', body: { title: 'Training' } })).status, 200);
    assert.equal((await api(`/families/${fid}/events/${mamas.id}`, { token: kind, method: 'PATCH', body: { title: 'Kino' } })).status, 403);
    assert.equal((await api(`/families/${fid}/events/${mamas.id}`, { token: kind, method: 'DELETE' })).status, 403);

    const list = (await api(`/families/${fid}/lists`, { token: mama, method: 'POST', body: { name: 'Einkauf' } })).data;
    assert.equal((await api(`/families/${fid}/lists/${list.id}`, { token: kind, method: 'DELETE' })).status, 403);
    const item = await api(`/families/${fid}/items`, { token: kind, method: 'POST', body: { list_id: list.id, text: 'Chips' } });
    assert.equal(item.status, 201);
    assert.equal((await api(`/families/${fid}/items/${item.data.id}`, { token: kind, method: 'PATCH', body: { done: true } })).status, 200);

    assert.equal((await api(`/families/${fid}/habits`, { token: kind, method: 'POST', body: { title: 'Zocken', interval_days: 1 } })).status, 403);
    const habit = (await api(`/families/${fid}/habits`, { token: mama, method: 'POST', body: { title: 'Zähne', interval_days: 1 } })).data;
    assert.equal((await api(`/families/${fid}/habits/${habit.id}`, { token: kind, method: 'DELETE' })).status, 403);
    assert.equal((await api(`/families/${fid}/habits/${habit.id}/checkins`, { token: kind, method: 'POST', body: { date: '2026-11-02' } })).status, 201);
    assert.equal((await api(`/families/${fid}/habits/${habit.id}/checkins`, { token: mama, method: 'POST', body: { date: '2026-11-02', user_id: ids.kind } })).status, 200, 'Eltern haken für Kinder ab (schon erledigt)');

    assert.equal((await api(`/families/${fid}/meals`, { token: kind, method: 'POST', body: { date: '2026-11-02', slot: 'dinner', title: 'Pizza' } })).status, 201);
    assert.equal((await api(`/families/${fid}/recipes`, { token: kind, method: 'POST', body: { title: 'Pizza' } })).status, 201);
    assert.equal((await api(`/families/${fid}/contacts`, { token: kind, method: 'POST', body: { name: 'Oma' } })).status, 201);

    // Pinnwand: Eltern dürfen Beiträge der Kinder löschen
    const post = (await api(`/families/${fid}/posts`, { token: kind, method: 'POST', body: { text: 'Hallo' } })).data;
    assert.equal((await api(`/families/${fid}/posts/${post.id}`, { token: mama, method: 'DELETE' })).status, 204);
  });

  test('bisherige Mitglieder werden beim Update zu Eltern', () => {
    const dir = mkdtempSync(join(tmpdir(), 'fc-rollen-'));
    try {
      const file = join(dir, 'alt.db');
      openDatabase(file).close();
      const raw = new DatabaseSync(file);
      raw.exec("INSERT INTO users (name, email, password_hash, color) VALUES ('A', 'a@x', 'x', '#000000'), ('B', 'b@x', 'x', '#000000')");
      raw.exec("INSERT INTO families (name, invite_code) VALUES ('F', 'ABC')");
      raw.exec("INSERT INTO memberships (family_id, user_id, role) VALUES (1, 1, 'admin'), (1, 2, 'member')");
      raw.close();
      const db = openDatabase(file);
      assert.deepEqual(db.prepare('SELECT role FROM memberships ORDER BY user_id').all().map((r) => r.role), ['admin', 'parent']);
      db.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

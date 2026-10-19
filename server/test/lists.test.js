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
async function family() {
  n += 1;
  const { data } = await api('/auth/register', { method: 'POST', body: { name: 'Mama', email: `mama${n}@listen.test`, password: 'geheim123' } });
  const { data: fam } = await api('/families', { token: data.token, method: 'POST', body: { name: 'F' } });
  return { token: data.token, fid: fam.id };
}

describe('Einkaufsliste', () => {
  test('jede neue Familie hat sie, sie steht oben und lässt sich weder löschen noch umbenennen', async () => {
    const { token, fid } = await family();
    await api(`/families/${fid}/lists`, { token, method: 'POST', body: { name: 'Baumarkt' } });
    const { data: lists } = await api(`/families/${fid}/lists`, { token });
    assert.deepEqual(lists.map((l) => [l.name, l.is_default]), [['Einkaufsliste', true], ['Baumarkt', false]]);
    const main = lists[0];
    assert.equal((await api(`/families/${fid}/lists/${main.id}`, { token, method: 'DELETE' })).status, 403);
    assert.equal((await api(`/families/${fid}/lists/${main.id}`, { token, method: 'PATCH', body: { name: 'Zeug' } })).status, 403);
    assert.equal((await api(`/families/${fid}/lists/${lists[1].id}`, { token, method: 'DELETE' })).status, 204, 'andere Listen schon');
  });

  test('Einträge mit Warengruppe', async () => {
    const { token, fid } = await family();
    const main = (await api(`/families/${fid}/lists`, { token })).data[0];
    const { data: item } = await api(`/families/${fid}/items`, { token, method: 'POST', body: { list_id: main.id, text: 'Äpfel' } });
    assert.equal(item.category, null, 'leer = automatisch');
    assert.equal((await api(`/families/${fid}/items/${item.id}`, { token, method: 'PATCH', body: { category: 'produce' } })).data.category, 'produce');
    assert.equal((await api(`/families/${fid}/items/${item.id}`, { token, method: 'PATCH', body: { category: 'quatsch' } })).status, 400);
  });

  test('bestehende Familien bekommen sie beim Update – eine vorhandene „Einkaufsliste“ wird übernommen', () => {
    const dir = mkdtempSync(join(tmpdir(), 'fc-listen-'));
    try {
      const file = join(dir, 'alt.db');
      openDatabase(file).close();
      const raw = new DatabaseSync(file);
      raw.exec("INSERT INTO families (name, invite_code) VALUES ('A', 'AAA'), ('B', 'BBB')");
      raw.exec("INSERT INTO lists (family_id, name, kind) VALUES (1, 'einkaufsliste', 'shopping'), (1, 'Baumarkt', 'shopping')");
      raw.exec('UPDATE lists SET is_default = 0');
      raw.close();
      const db = openDatabase(file);
      const rows = db.prepare('SELECT family_id, name, is_default FROM lists ORDER BY family_id, id').all().map((r) => [r.family_id, r.name, r.is_default]);
      assert.deepEqual(rows, [[1, 'Einkaufsliste', 1], [1, 'Baumarkt', 0], [2, 'Einkaufsliste', 1]]);
      db.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

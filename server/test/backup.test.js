import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/app.js';
import { openDatabase } from '../src/db.js';
import { ServerBackup, watchBackup } from '../src/backup.js';

const dir = mkdtempSync(join(tmpdir(), 'fc-backup-'));
const requestFile = join(dir, 'backup-request');
const statusFile = join(dir, 'backup-status.json');
let server;
let base;
let db;
before(async () => {
  db = openDatabase(':memory:');
  const app = createApp(db, { backup: new ServerBackup({ requestFile }) });
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
  return { status: res.status, data: await res.json() };
}

test('Sicherung: Zustand, Anstoßen nur für Admins, Warnung', async () => {
  const reg = async (name) => (await api('/auth/register', { method: 'POST', body: { name, email: `${name}@backup.test`, password: 'geheim123' } })).data.token;
  const mama = await reg('Mama');
  const lea = await reg('Lea');
  const { data: fam } = await api('/families', { token: mama, method: 'POST', body: { name: 'F' } });
  await api('/families/join', { token: lea, method: 'POST', body: { code: fam.invite_code } });
  const path = `/families/${fam.id}/server-backup`;

  assert.equal((await api(path, { token: lea })).status, 403);
  assert.deepEqual((await api(path, { token: mama })).data, { enabled: true, requested: false, status: null });
  assert.equal((await api(path, { token: mama, method: 'POST' })).status, 202);
  assert.ok(existsSync(requestFile));
  assert.equal((await api(path, { token: mama, method: 'POST' })).status, 409, 'läuft schon');

  const backup = new ServerBackup({ requestFile });
  const now = Date.parse('2026-11-16T12:00:00Z');
  writeFileSync(statusFile, JSON.stringify({ state: 'off', message: 'nicht eingerichtet', at: '', last_ok: '', size: 0 }));
  assert.equal(backup.problem(now), null, 'ohne Google Drive keine Warnung');
  writeFileSync(statusFile, JSON.stringify({ state: 'ok', message: '', at: '', last_ok: '2026-11-16T03:10:00+01:00', size: 5 }));
  assert.equal(backup.problem(now), null);
  assert.match(backup.problem(now + 3 * 86400000), /zwei Tagen/);
  writeFileSync(statusFile, JSON.stringify({ state: 'failed', message: 'Hochladen zu Google Drive fehlgeschlagen', at: '', last_ok: '', size: 0 }));
  const pushes = [];
  clearInterval(watchBackup(db, backup, { notify: (ids, m) => pushes.push([ids, m]) }));
  assert.equal(pushes.length, 1);
  assert.equal(pushes[0][0].length, 1, 'nur der Admin');
  assert.match(pushes[0][1].body, /fehlgeschlagen/);
});

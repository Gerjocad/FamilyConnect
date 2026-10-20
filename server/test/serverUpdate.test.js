import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/app.js';
import { openDatabase } from '../src/db.js';
import { readInstalled, ServerUpdate } from '../src/serverUpdate.js';

const dir = mkdtempSync(join(tmpdir(), 'fc-update-'));
const requestFile = join(dir, 'update-request');
let githubCalls = 0;
const updater = new ServerUpdate({
  requestFile,
  installed: { commit: 'aaa1111', date: '2026-10-19T10:00:00+02:00', branch: 'main', repo: 'Gerjocad/FamilyConnect' },
  fetchImpl: async (url) => {
    githubCalls += 1;
    assert.match(url, /repos\/Gerjocad\/FamilyConnect\/commits\/main$/);
    return new Response(JSON.stringify({ sha: 'bbb2222', commit: { message: 'Urlaub im Kalender\n\nDetails', committer: { date: '2026-10-20T09:00:00Z' } } }));
  },
});

let server;
let base;
before(async () => {
  const app = createApp(openDatabase(':memory:'), { updater });
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

describe('Server-Update aus der App', () => {
  test('Admin fordert an, update.sh meldet den Stand', async () => {
    const reg = async (name) => (await api('/auth/register', {
      method: 'POST', body: { name, email: `${name}@update.test`, password: 'geheim123' },
    })).data.token;
    const mama = await reg('Mama');
    const tom = await reg('Tom');
    const { data: fam } = await api('/families', { token: mama, method: 'POST', body: { name: 'F' } });
    await api('/families/join', { token: tom, method: 'POST', body: { code: fam.invite_code } });
    const path = `/families/${fam.id}/server-update`;

    assert.equal((await api(path, { token: tom })).status, 403, 'nur Admins');
    assert.equal((await api(path, { token: tom, method: 'POST' })).status, 403);

    const { data: info } = await api(path, { token: mama });
    assert.equal(info.enabled, true);
    assert.equal(info.installed.commit, 'aaa1111');
    assert.deepEqual(info.latest, { commit: 'bbb2222', date: '2026-10-20T09:00:00Z', message: 'Urlaub im Kalender' });
    assert.equal(info.status, null);
    await api(path, { token: mama });
    assert.equal(githubCalls, 1, 'GitHub-Abfrage wird zwischengespeichert');

    assert.equal((await api(path, { token: mama, method: 'POST' })).status, 202);
    assert.ok(existsSync(requestFile));
    assert.match(readFileSync(requestFile, 'utf8'), /Mama/);
    assert.equal((await api(path, { token: mama, method: 'POST' })).status, 409, 'nicht doppelt');
    assert.equal((await api(path, { token: mama })).data.requested, true);

    // So meldet sich deploy/update.sh
    writeFileSync(join(dir, 'update-status.json'), '{"state":"done","message":"Aktualisiert","at":"2026-10-20T10:00:00+02:00","commit":"bbb2222"}\n');
    assert.equal((await api(path, { token: mama })).data.status.state, 'done');
  });

  test('ohne Einrichtung abgeschaltet', async () => {
    const off = new ServerUpdate();
    assert.equal(off.enabled, false);
    assert.equal(off.status(), null);
  });

  test('liest den installierten Stand aus Git', (t) => {
    const root = new URL('../..', import.meta.url).pathname;
    if (!existsSync(join(root, '.git'))) return t.skip('kein Git-Verzeichnis');
    const info = readInstalled(root);
    assert.match(info.commit, /^[0-9a-f]{40}$/);
  });
});

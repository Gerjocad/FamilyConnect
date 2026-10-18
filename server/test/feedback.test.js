import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/app.js';
import { openDatabase } from '../src/db.js';

// 1×1-PNG
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

let server;
let base;
let uploadDir;
before(async () => {
  uploadDir = mkdtempSync(join(tmpdir(), 'fc-up-'));
  const app = createApp(openDatabase(':memory:'), { uploadDir });
  await new Promise((resolve) => { server = app.listen(0, resolve); });
  base = `http://127.0.0.1:${server.address().port}/api`;
});
after(() => {
  server.close();
  rmSync(uploadDir, { recursive: true, force: true });
});

async function api(path, { token, method = 'GET', body } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const type = res.headers.get('content-type') ?? '';
  return { status: res.status, data: res.status === 204 ? null : type.includes('json') ? await res.json() : await res.arrayBuffer() };
}

let n = 0;
async function family() {
  n += 1;
  const reg = async (name) => (await api('/auth/register', {
    method: 'POST', body: { name, email: `${name}${n}@fb.test`, password: 'geheim123' },
  })).data.token;
  const admin = await reg('Admin');
  const kind = await reg('Kind');
  const { data: fam } = await api('/families', { token: admin, method: 'POST', body: { name: 'F' } });
  await api('/families/join', { token: kind, method: 'POST', body: { code: fam.invite_code } });
  return { admin, kind, fid: fam.id };
}

describe('Feedback', () => {
  test('mit Screenshots anlegen, Bild abrufen, Status ändern, löschen', async () => {
    const { admin, kind, fid } = await family();
    const { status, data } = await api(`/families/${fid}/feedback`, {
      token: kind, method: 'POST', body: { kind: 'bug', text: 'Knopf geht nicht', images: [PNG, PNG] },
    });
    assert.equal(status, 201);
    assert.equal(data.kind, 'bug');
    assert.equal(data.status, 'open');
    assert.equal(data.images.length, 2);
    assert.equal(readdirSync(uploadDir).length >= 2, true);

    // Bild über ?token= (wie im <img>-Tag)
    const img = await fetch(`${base}/families/${fid}/feedback-images/${data.images[0]}?token=${kind}`);
    assert.equal(img.status, 200);
    assert.equal(img.headers.get('content-type'), 'image/png');
    // Fremde Familie kommt nicht an das Bild
    const other = await family();
    assert.equal((await fetch(`${base}/families/${other.fid}/feedback-images/${data.images[0]}?token=${other.admin}`)).status, 404);
    assert.equal((await fetch(`${base}/families/${fid}/feedback-images/${data.images[0]}?token=${other.admin}`)).status, 403);

    // Status: Admin darf, ein anderes Mitglied ohne eigenes Feedback nicht
    const { data: own } = await api(`/families/${fid}/feedback`, { token: admin, method: 'POST', body: { text: 'Idee vom Admin' } });
    assert.equal((await api(`/families/${fid}/feedback/${own.id}`, { token: kind, method: 'PATCH', body: { status: 'done' } })).status, 403);
    assert.equal((await api(`/families/${fid}/feedback/${data.id}`, { token: admin, method: 'PATCH', body: { status: 'done' } })).data.status, 'done');

    // Offene zuerst
    const { data: list } = await api(`/families/${fid}/feedback`, { token: kind });
    assert.deepEqual(list.map((f) => f.text), ['Idee vom Admin', 'Knopf geht nicht']);

    // Löschen entfernt auch die Dateien
    await api(`/families/${fid}/feedback/${data.id}`, { token: kind, method: 'DELETE' });
    for (const name of data.images) assert.equal(existsSync(join(uploadDir, name)), false);
  });

  test('Prüfungen', async () => {
    const { kind, fid } = await family();
    const post = (body) => api(`/families/${fid}/feedback`, { token: kind, method: 'POST', body });
    assert.equal((await post({ text: '' })).status, 400);
    assert.equal((await post({ text: 'x', images: ['data:text/html;base64,PGgxPg=='] })).status, 400);
    assert.equal((await post({ text: 'x', images: Array(6).fill(PNG) })).status, 400);
    assert.equal((await post({ text: 'x', kind: 'quatsch' })).data.kind, 'idea');
    assert.equal((await fetch(`${base}/families/${fid}/feedback-images/..%2F..%2Fetc%2Fpasswd?token=${kind}`)).status, 404);
  });

  test('große Screenshots über dem allgemeinen Limit', async () => {
    const { kind, fid } = await family();
    const big = `data:image/jpeg;base64,${Buffer.alloc(1_500_000, 7).toString('base64')}`;
    const { status } = await api(`/families/${fid}/feedback`, { token: kind, method: 'POST', body: { text: 'groß', images: [big] } });
    assert.equal(status, 201);
    // andere Endpunkte behalten das kleine Limit
    const huge = await api(`/families/${fid}/posts`, { token: kind, method: 'POST', body: { text: 'x'.repeat(200_000) } });
    assert.equal(huge.status, 413);
  });
});

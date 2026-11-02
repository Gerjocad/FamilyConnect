import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
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

describe('Kürzel', () => {
  test('selbst setzen, Admin für alle, leer = automatisch', async () => {
    const reg = async (name) => (await api('/auth/register', { method: 'POST', body: { name, email: `${name}@kurz.test`, password: 'geheim123' } })).data.token;
    const sara = await reg('Sara');
    const selin = await reg('Selin');
    const { data: fam } = await api('/families', { token: sara, method: 'POST', body: { name: 'F' } });
    const { data: joined } = await api('/families/join', { token: selin, method: 'POST', body: { code: fam.invite_code } });
    const selinId = joined.members.find((m) => m.name === 'Selin').id;

    assert.equal((await api('/me', { token: sara, method: 'PATCH', body: { initials: 'sa' } })).data.initials, 'SA');
    assert.equal((await api('/me', { token: sara })).data.initials, 'SA');
    assert.equal((await api('/me', { token: sara, method: 'PATCH', body: { initials: 'zuviel' } })).status, 400);

    const path = `/families/${fam.id}/members/${selinId}`;
    assert.equal((await api(path, { token: selin, method: 'PATCH', body: { initials: 'X' } })).status, 403, 'nur Admins für andere');
    const { data: family } = await api(path, { token: sara, method: 'PATCH', body: { initials: 'se' } });
    assert.deepEqual(family.members.map((m) => [m.name, m.initials]), [['Sara', 'SA'], ['Selin', 'SE']]);
    assert.equal(family.members.find((m) => m.name === 'Selin').role, 'child', 'Rolle bleibt');

    const { data: reset } = await api('/me', { token: selin, method: 'PATCH', body: { initials: '' } });
    assert.equal(reset.initials, null);
  });
});

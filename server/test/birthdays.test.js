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

let n = 0;
async function family() {
  n += 1;
  const reg = async (name) => (await api('/auth/register', {
    method: 'POST', body: { name, email: `${name}${n}@geburtstag.test`, password: 'geheim123' },
  })).data.token;
  const mama = await reg('Mama');
  const tom = await reg('Tom');
  const lea = await reg('Lea');
  const { data: fam } = await api('/families', { token: mama, method: 'POST', body: { name: 'F' } });
  await api('/families/join', { token: tom, method: 'POST', body: { code: fam.invite_code } });
  const { data: joined } = await api('/families/join', { token: lea, method: 'POST', body: { code: fam.invite_code } });
  const id = (name) => joined.members.find((m) => m.name === name).id;
  return { mama, tom, lea, fid: fam.id, ids: { mama: id('Mama'), tom: id('Tom'), lea: id('Lea') } };
}

describe('Geburtstage', () => {
  test('eintragen: selbst oder Eltern für andere', async () => {
    const { mama, tom, fid, ids } = await family();
    const put = (token, userId, birthday) => api(`/families/${fid}/members/${userId}/birthday`, { token, method: 'PUT', body: { birthday } });
    assert.equal((await put(tom, ids.tom, '2014-03-09')).status, 204);
    assert.equal((await put(tom, ids.lea, '2016-05-01')).status, 403, 'Kind nicht für andere');
    assert.equal((await put(mama, ids.lea, '2016-05-01')).status, 204);
    assert.equal((await put(mama, ids.lea, '2099-01-01')).status, 400, 'nicht in der Zukunft');
    const { data } = await api(`/families/${fid}`, { token: tom });
    assert.deepEqual(data.members.map((m) => [m.name, m.birthday]), [['Mama', null], ['Tom', '2014-03-09'], ['Lea', '2016-05-01']]);
    // Kontakte bekommen ebenfalls einen Geburtstag
    const { data: oma } = await api(`/families/${fid}/contacts`, { token: mama, method: 'POST', body: { name: 'Oma', birthday: '1955-12-24' } });
    assert.equal(oma.birthday, '1955-12-24');
  });

  test('Geschenkideen sieht die beschenkte Person nicht', async () => {
    const { mama, tom, lea, fid, ids } = await family();
    const path = `/families/${fid}/gift-ideas`;
    const { data: idea } = await api(path, { token: mama, method: 'POST', body: { for_user_id: ids.lea, text: 'Lego Friends' } });
    assert.equal(idea.bought, false);
    await api(path, { token: lea, method: 'POST', body: { for_user_id: ids.tom, text: 'Fußball' } });
    assert.equal((await api(path, { token: lea, method: 'POST', body: { for_user_id: ids.lea, text: 'Für mich' } })).status, 400, 'nicht für sich selbst');
    assert.equal((await api(path, { token: tom, method: 'POST', body: { text: 'X' } })).status, 400, 'Für wen?');

    assert.deepEqual((await api(path, { token: lea })).data.map((i) => i.text), ['Fußball'], 'Lea sieht ihr Geschenk nicht');
    assert.deepEqual((await api(path, { token: tom })).data.map((i) => i.text), ['Lego Friends']);
    assert.equal((await api(`${path}/${idea.id}`, { token: lea, method: 'PATCH', body: { bought: true } })).status, 404);
    assert.equal((await api(`${path}/${idea.id}`, { token: tom, method: 'PATCH', body: { bought: true } })).data.bought, true);
    assert.equal((await api(`${path}/${idea.id}`, { token: lea, method: 'DELETE' })).status, 404);
    assert.equal((await api(`${path}/${idea.id}`, { token: tom, method: 'DELETE' })).status, 204);
  });
});

import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { openDatabase } from '../src/db.js';

let server;
let base;
const pushes = [];
before(async () => {
  const app = createApp(openDatabase(':memory:'), { push: { handleChange: (c) => pushes.push(c) } });
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

describe('Abstimmungen', () => {
  test('anlegen, abstimmen, umentscheiden, zurücknehmen, mit dem Beitrag löschen', async () => {
    const reg = async (name) => (await api('/auth/register', { method: 'POST', body: { name, email: `${name}@umfrage.test`, password: 'geheim123' } })).data.token;
    const mama = await reg('Mama');
    const lea = await reg('Lea');
    const { data: fam } = await api('/families', { token: mama, method: 'POST', body: { name: 'F' } });
    await api('/families/join', { token: lea, method: 'POST', body: { code: fam.invite_code } });
    const path = `/families/${fam.id}/polls`;

    assert.equal((await api(path, { token: lea, method: 'POST', body: { text: 'Essen?', options: ['Pizza'] } })).status, 400);
    assert.equal((await api(path, { token: lea, method: 'POST', body: { text: 'Essen?', options: ['Pizza', 'pizza '.trim().replace('p', 'P')] } })).status, 400, 'doppelte zählen einmal');
    const { status, data: poll } = await api(path, { token: lea, method: 'POST', body: { text: 'Was essen wir Samstag?', options: ['Pizza', 'Burger', ' ', 'Sushi'] } });
    assert.equal(status, 201);
    assert.deepEqual(poll.options.map((o) => o.text), ['Pizza', 'Burger', 'Sushi']);
    assert.equal(pushes.at(-1).row.text, '📊 Was essen wir Samstag?');
    const posts = (await api(`/families/${fam.id}/posts`, { token: mama })).data;
    assert.equal(posts[0].text, 'Was essen wir Samstag?', 'erscheint als Beitrag');

    const vote = (token, option_id) => api(`${path}/${poll.post_id}/vote`, { token, method: 'PUT', body: { option_id } });
    await vote(mama, poll.options[0].id);
    await vote(lea, poll.options[1].id);
    const changed = await vote(lea, poll.options[0].id);
    assert.deepEqual(changed.data.votes.map((v) => v.option_id).sort(), [poll.options[0].id, poll.options[0].id]);
    assert.equal((await vote(lea, 999999)).status, 400);
    assert.equal((await vote(lea, null)).data.votes.length, 1, 'Stimme zurückgenommen');

    await api(`/families/${fam.id}/posts/${poll.post_id}`, { token: lea, method: 'DELETE' });
    assert.deepEqual((await api(path, { token: mama })).data, []);
  });
});

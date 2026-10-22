import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { openDatabase } from '../src/db.js';

const sent = [];
let server;
let base;
before(async () => {
  const push = { notify: (ids, m) => sent.push([ids, m]), handleChange() {} };
  const app = createApp(openDatabase(':memory:'), { push });
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

describe('Pinnwand: Kommentare und Reaktionen', () => {
  test('kommentieren, reagieren, Glocke, Löschen', async () => {
    const reg = async (name) => (await api('/auth/register', { method: 'POST', body: { name, email: `${name}@pin.test`, password: 'geheim123' } })).data.token;
    const mama = await reg('Mama');
    const lea = await reg('Lea');
    const tom = await reg('Tom');
    const { data: fam } = await api('/families', { token: mama, method: 'POST', body: { name: 'F' } });
    await api('/families/join', { token: lea, method: 'POST', body: { code: fam.invite_code } });
    const { data: joined } = await api('/families/join', { token: tom, method: 'POST', body: { code: fam.invite_code } });
    const ids = Object.fromEntries(joined.members.map((m) => [m.name, m.id]));
    const f = `/families/${fam.id}`;
    const { data: post } = await api(`${f}/posts`, { token: mama, method: 'POST', body: { text: 'Pizza heute Abend?' } });

    const c1 = await api(`${f}/posts/${post.id}/comments`, { token: lea, method: 'POST', body: { text: 'Ja bitte! 🍕' } });
    assert.equal(c1.status, 201);
    assert.deepEqual(sent.at(-1), [[ids.Mama], { title: '💬 Lea auf der Pinnwand', body: 'Ja bitte! 🍕', path: '/pinnwand' }]);
    await api(`${f}/posts/${post.id}/comments`, { token: tom, method: 'POST', body: { text: 'Mit Salami' } });
    assert.deepEqual(sent.at(-1)[0].sort(), [ids.Mama, ids.Lea].sort(), 'Autor und wer schon kommentiert hat');
    assert.equal((await api(`${f}/posts/${post.id}/comments`, { token: tom, method: 'POST', body: { text: ' ' } })).status, 400);

    assert.equal((await api(`${f}/posts/${post.id}/reaction`, { token: lea, method: 'PUT', body: { emoji: '🤖' } })).status, 400);
    await api(`${f}/posts/${post.id}/reaction`, { token: lea, method: 'PUT', body: { emoji: '❤️' } });
    assert.equal(sent.at(-1)[1].title, '❤️ Lea hat reagiert');
    const pushes = sent.length;
    await api(`${f}/posts/${post.id}/reaction`, { token: lea, method: 'PUT', body: { emoji: '😂' } });
    assert.equal(sent.length, pushes, 'Wechseln meldet nicht nochmal');
    await api(`${f}/posts/${post.id}/reaction`, { token: tom, method: 'PUT', body: { emoji: '👍' } });
    await api(`${f}/posts/${post.id}/reaction`, { token: tom, method: 'PUT', body: { emoji: null } });

    const { data: extras } = await api(`${f}/post-extras`, { token: mama });
    assert.deepEqual(extras.comments.map((c) => c.text), ['Ja bitte! 🍕', 'Mit Salami']);
    assert.deepEqual(extras.reactions.map((r) => [r.user_id, r.emoji]), [[ids.Lea, '😂']]);

    const kinds = (await api(`${f}/activity`, { token: mama })).data.items.map((i) => i.kind).sort();
    assert.deepEqual(kinds, ['post-comment', 'post-comment', 'post-reaction']);
    assert.deepEqual((await api(`${f}/activity`, { token: lea })).data.items.map((i) => i.kind), ['post-comment', 'post'], 'Lea: Toms Antwort + der Beitrag');

    assert.equal((await api(`${f}/post-comments/${c1.data.id}`, { token: tom, method: 'DELETE' })).status, 403);
    assert.equal((await api(`${f}/post-comments/${c1.data.id}`, { token: mama, method: 'DELETE' })).status, 204);
    await api(`${f}/posts/${post.id}`, { token: mama, method: 'DELETE' });
    const after = (await api(`${f}/post-extras`, { token: mama })).data;
    assert.deepEqual([after.comments.length, after.reactions.length], [0, 0], 'mit dem Beitrag gelöscht');
  });
});

import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/app.js';
import { openDatabase } from '../src/db.js';

// 1×1-PNG
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

let server;
let base;
let uploadDir;
const pushes = [];
before(async () => {
  uploadDir = mkdtempSync(join(tmpdir(), 'fc-complaints-'));
  const push = {
    notifyComplaint: (m) => pushes.push(['neu', m]),
    notifyComplaintResolved: (m) => pushes.push(['erledigt', m]),
    notify: (ids, m) => pushes.push(['kommentar', ids, m]),
    handleChange() {},
  };
  const app = createApp(openDatabase(':memory:'), { uploadDir, push });
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
  return { status: res.status, data: res.status === 204 ? null : await res.json() };
}

let n = 0;
/** Mama (Admin), Tom und Lea (Kinder) */
async function family() {
  n += 1;
  const reg = async (name) => (await api('/auth/register', {
    method: 'POST', body: { name, email: `${name}${n}@beschwerde.test`, password: 'geheim123' },
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

describe('Beschwerden', () => {
  test('mit Foto an eine Person; sehen dürfen nur Beteiligte und Eltern', async () => {
    const { mama, tom, lea, fid, ids } = await family();
    const path = `/families/${fid}/complaints`;
    const post = (token, body) => api(path, { token, method: 'POST', body });

    assert.equal((await post(lea, { text: 'Bad nicht geputzt', recipient_id: ids.tom })).status, 400, 'Foto fehlt');
    assert.equal((await post(lea, { text: '', recipient_id: ids.tom, images: [PNG] })).status, 400, 'Text fehlt');
    assert.equal((await post(lea, { text: 'X', images: [PNG] })).status, 400, 'Empfänger fehlt');
    assert.equal((await post(lea, { text: 'X', recipient_id: ids.lea, images: [PNG] })).status, 400, 'nicht an sich selbst');
    assert.equal((await post(lea, { text: 'X', recipient_id: 99999, images: [PNG] })).status, 400, 'nur Familienmitglieder');
    assert.equal((await post(lea, { text: 'X', recipient_id: ids.tom, images: [PNG, PNG, PNG, PNG] })).status, 400, 'max. 3 Fotos');

    const { status, data } = await post(lea, { text: 'Tom hat das Bad nicht geputzt', recipient_id: ids.tom, images: [PNG] });
    assert.equal(status, 201);
    assert.equal(data.status, 'open');
    assert.equal(data.recipient_id, ids.tom);
    assert.equal(data.images.length, 1);
    assert.deepEqual(pushes.at(-1), ['neu', { recipientId: ids.tom, from: 'Lea', text: 'Tom hat das Bad nicht geputzt' }]);

    // Mama schreibt Lea – das sieht Tom nicht
    await post(mama, { text: 'Zimmer!', recipient_id: ids.lea, images: [PNG] });
    const count = async (token) => (await api(path, { token })).data.length;
    assert.equal(await count(tom), 1, 'Tom sieht nur die an ihn');
    assert.equal(await count(lea), 2, 'Lea: ihre eigene und die an sie');
    assert.equal(await count(mama), 2, 'Eltern sehen alle');

    // Foto: Beteiligte ja, Unbeteiligte nein
    const img = (token) => fetch(`${base}/families/${fid}/complaint-images/${data.images[0]}?token=${token}`).then((r) => r.status);
    assert.equal(await img(tom), 200);
    assert.equal(await img(mama), 200);
    const mamasToLea = (await api(path, { token: mama })).data.find((c) => c.recipient_id === ids.lea);
    assert.equal(await fetch(`${base}/families/${fid}/complaint-images/${mamasToLea.images[0]}?token=${tom}`).then((r) => r.status), 404);
  });

  test('Empfänger antwortet und erledigt; nur Absender oder Eltern löschen', async () => {
    const { mama, tom, lea, fid, ids } = await family();
    const path = `/families/${fid}/complaints`;
    const { data: c } = await api(path, { token: lea, method: 'POST', body: { text: 'Socken liegen rum', recipient_id: ids.tom, images: [PNG, PNG] } });

    assert.equal((await api(`${path}/${c.id}`, { token: lea, method: 'PATCH', body: { status: 'resolved' } })).status, 403, 'Absender erledigt nicht selbst');
    const done = await api(`${path}/${c.id}`, { token: tom, method: 'PATCH', body: { status: 'resolved', reply: 'Sind weggeräumt!' } });
    assert.equal(done.status, 200);
    assert.equal(done.data.status, 'resolved');
    assert.equal(done.data.reply, 'Sind weggeräumt!');
    assert.equal(done.data.resolved_by, ids.tom);
    assert.ok(done.data.resolved_at);
    assert.deepEqual(pushes.at(-1), ['erledigt', { creatorId: ids.lea, by: 'Tom', reply: 'Sind weggeräumt!' }]);
    const reopened = await api(`${path}/${c.id}`, { token: mama, method: 'PATCH', body: { status: 'open' } });
    assert.equal(reopened.data.resolved_at, null);

    assert.equal((await api(`${path}/${c.id}`, { token: tom, method: 'DELETE' })).status, 403, 'Empfänger löscht nicht');
    const before = readdirSync(uploadDir).length;
    assert.equal((await api(`${path}/${c.id}`, { token: lea, method: 'DELETE' })).status, 204);
    assert.equal(readdirSync(uploadDir).length, before - 2, 'Fotos werden mit gelöscht');
  });

  test('Kommentare: Beteiligte schreiben, Glocke und Push, Unbeteiligte sehen nichts', async () => {
    const { mama, tom, lea, fid, ids } = await family();
    const path = `/families/${fid}/complaints`;
    const { data: c } = await api(path, { token: lea, method: 'POST', body: { text: 'Bad!', recipient_id: ids.tom, images: [PNG] } });
    assert.deepEqual(c.comments, []);

    const r1 = await api(`${path}/${c.id}/comments`, { token: tom, method: 'POST', body: { text: 'Das war ich nicht!' } });
    assert.equal(r1.status, 201);
    assert.deepEqual(r1.data.comments.map((k) => [k.user_id, k.text]), [[ids.tom, 'Das war ich nicht!']]);
    assert.deepEqual(pushes.at(-1), ['kommentar', [ids.lea], { title: 'Tom zu einer Beschwerde', body: 'Das war ich nicht!', path: '/beschwerden' }]);
    assert.equal((await api(`${path}/${c.id}/comments`, { token: tom, method: 'POST', body: { text: '  ' } })).status, 400);

    // Mama (Eltern) darf mitreden, beide Beteiligten werden benachrichtigt
    await api(`${path}/${c.id}/comments`, { token: mama, method: 'POST', body: { text: 'Klärt das bitte' } });
    assert.deepEqual(pushes.at(-1)[1].sort(), [ids.lea, ids.tom].sort());

    // Lea sieht beide Kommentare in der Glocke, Tom nur Mamas
    const kinds = async (token) => (await api(`/families/${fid}/activity`, { token })).data.items.filter((i) => i.kind === 'complaint-comment').map((i) => i.text);
    assert.deepEqual((await kinds(lea)).sort(), ['Das war ich nicht!', 'Klärt das bitte']);
    assert.deepEqual(await kinds(tom), ['Klärt das bitte']);

    // Eine Beschwerde, die Tom nicht sieht, kann er auch nicht kommentieren
    const { data: other } = await api(path, { token: mama, method: 'POST', body: { text: 'Zimmer', recipient_id: ids.lea, images: [PNG] } });
    assert.equal((await api(`${path}/${other.id}/comments`, { token: tom, method: 'POST', body: { text: 'Haha' } })).status, 404);

    const commentId = r1.data.comments[0].id;
    assert.equal((await api(`/families/${fid}/complaint-comments/${commentId}`, { token: lea, method: 'DELETE' })).status, 403);
    assert.equal((await api(`/families/${fid}/complaint-comments/${commentId}`, { token: tom, method: 'DELETE' })).status, 204);
    assert.equal((await api(path, { token: lea })).data.find((x) => x.id === c.id).comments.length, 1);
  });
});


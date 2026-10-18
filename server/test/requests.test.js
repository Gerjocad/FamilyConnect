import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { openDatabase } from '../src/db.js';

let server;
let base;
const pushes = [];
before(async () => {
  const push = { notify: (ids, m) => pushes.push([ids, m]), handleChange() {} };
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

let n = 0;
/** Papa (Admin), Mama (Eltern), Lea (Kind) */
async function family() {
  n += 1;
  const reg = async (name) => (await api('/auth/register', {
    method: 'POST', body: { name, email: `${name}${n}@anfrage.test`, password: 'geheim123' },
  })).data.token;
  const papa = await reg('Papa');
  const mama = await reg('Mama');
  const lea = await reg('Lea');
  const { data: fam } = await api('/families', { token: papa, method: 'POST', body: { name: 'F' } });
  await api('/families/join', { token: mama, method: 'POST', body: { code: fam.invite_code } });
  const { data: joined } = await api('/families/join', { token: lea, method: 'POST', body: { code: fam.invite_code } });
  const id = (name) => joined.members.find((m) => m.name === name).id;
  const ids = { papa: id('Papa'), mama: id('Mama'), lea: id('Lea') };
  await api(`/families/${fam.id}/members/${ids.mama}`, { token: papa, method: 'PATCH', body: { role: 'parent' } });
  return { papa, mama, lea, fid: fam.id, ids };
}

describe('Anfragen', () => {
  test('anlegen, prüfen, Sichtbarkeit', async () => {
    const { papa, mama, lea, fid, ids } = await family();
    const path = `/families/${fid}/requests`;
    const post = (token, body) => api(path, { token, method: 'POST', body });
    assert.equal((await post(lea, { title: '', recipient_id: ids.papa })).status, 400);
    assert.equal((await post(lea, { title: 'X' })).status, 400, 'Empfänger fehlt');
    assert.equal((await post(lea, { title: 'X', recipient_id: ids.lea })).status, 400, 'nicht sich selbst');
    assert.equal((await post(lea, { title: 'X', recipient_id: ids.papa, time_from: '15:00' })).status, 400, 'Uhrzeit ohne Tag');
    assert.equal((await post(lea, { title: 'X', recipient_id: ids.papa, date: '2026-10-24', time_from: '18:00', time_to: '15:00' })).status, 400);

    const { status, data } = await post(lea, {
      title: 'Darf ich mich mit Tim treffen?', details: 'Im Park', category: 'friends', recipient_id: ids.papa,
      date: '2026-10-24', time_from: '15:00', time_to: '18:00',
    });
    assert.equal(status, 201);
    assert.equal(data.status, 'pending');
    assert.equal(data.category, 'friends');
    assert.deepEqual(pushes.at(-1), [[ids.papa], { title: 'Anfrage von Lea', body: 'Darf ich mich mit Tim treffen?', path: '/anfragen' }]);

    // Lea fragt Mama etwas – Papa (Admin) sieht alles, Mama nur als Elternteil ebenfalls
    await post(lea, { title: 'Pizza?', recipient_id: ids.mama, category: 'unbekannt' });
    assert.equal((await api(path, { token: papa })).data.length, 2);
    assert.equal((await api(path, { token: mama })).data.length, 2);
    assert.equal((await api(path, { token: lea })).data.length, 2);
    assert.equal((await api(path, { token: lea })).data.find((r) => r.title === 'Pizza?').category, 'general');
  });

  test('Ja mit Notiz, dann in den Kalender', async () => {
    const { papa, mama, lea, fid, ids } = await family();
    const path = `/families/${fid}/requests`;
    const { data: r } = await api(path, { token: lea, method: 'POST', body: { title: 'Kino mit Tim', recipient_id: ids.papa, date: '2026-10-24', time_from: '15:00' } });
    const respond = (token, body) => api(`${path}/${r.id}/respond`, { token, method: 'POST', body });
    assert.equal((await respond(mama, { decision: 'approve' })).status, 403, 'nur wer gefragt wurde');
    assert.equal((await respond(lea, { decision: 'approve' })).status, 403);
    assert.equal((await respond(papa, { decision: 'vielleicht' })).status, 400);
    const ok = await respond(papa, { decision: 'approve', note: 'Um 18 Uhr zurück!' });
    assert.equal(ok.status, 200);
    assert.equal(ok.data.status, 'approved');
    assert.equal(ok.data.response_note, 'Um 18 Uhr zurück!');
    assert.ok(ok.data.responded_at);
    assert.deepEqual(pushes.at(-1), [[ids.lea], { title: 'Papa sagt Ja ✅', body: 'Kino mit Tim – Um 18 Uhr zurück!', path: '/anfragen' }]);
    assert.equal((await respond(papa, { decision: 'decline' })).status, 409, 'nur einmal antworten');

    // In den Kalender – nur Lea, nur einmal
    assert.equal((await api(`${path}/${r.id}/calendar`, { token: papa, method: 'POST' })).status, 403);
    const cal = await api(`${path}/${r.id}/calendar`, { token: lea, method: 'POST' });
    assert.equal(cal.status, 200);
    assert.ok(cal.data.event_id);
    assert.equal((await api(`${path}/${r.id}/calendar`, { token: lea, method: 'POST' })).status, 409);
    const event = (await api(`/families/${fid}/events`, { token: lea })).data.find((e) => e.id === cal.data.event_id);
    assert.equal(event.title, 'Kino mit Tim');
    assert.equal(event.start, '2026-10-24T15:00');
    assert.equal(event.end, '2026-10-24T16:00');
    assert.deepEqual(event.member_ids, [ids.lea]);
    assert.match(event.description, /Um 18 Uhr zurück/);
  });

  test('Gegenvorschlag annehmen bzw. ablehnen, Nein, zurückziehen, löschen', async () => {
    const { papa, mama, lea, fid, ids } = await family();
    const path = `/families/${fid}/requests`;
    const create = async (body) => (await api(path, { token: lea, method: 'POST', body: { recipient_id: ids.mama, ...body } })).data;

    const a = await create({ title: 'Übernachten bei Mia am Freitag?', date: '2026-10-23', category: 'sleepover' });
    assert.equal((await api(`${path}/${a.id}/respond`, { token: mama, method: 'POST', body: { decision: 'counter' } })).status, 400, 'Gegenvorschlag braucht Text');
    const counter = await api(`${path}/${a.id}/respond`, { token: mama, method: 'POST', body: { decision: 'counter', note: 'Lieber Samstag', counter_date: '2026-10-24' } });
    assert.equal(counter.data.status, 'countered');
    assert.equal(counter.data.counter_date, '2026-10-24');
    assert.equal(pushes.at(-1)[1].title, 'Mama hat einen Gegenvorschlag');
    assert.equal((await api(`${path}/${a.id}/counter`, { token: mama, method: 'POST', body: { accept: true } })).status, 403, 'nur wer gefragt hat');
    const accepted = await api(`${path}/${a.id}/counter`, { token: lea, method: 'POST', body: { accept: true } });
    assert.equal(accepted.data.status, 'approved');
    assert.equal(accepted.data.counter_accepted, true);
    assert.deepEqual(pushes.at(-1)[0], [ids.mama]);
    // Kalender nimmt den Gegenvorschlag (ganztägig, Samstag)
    const cal = (await api(`${path}/${a.id}/calendar`, { token: lea, method: 'POST' })).data;
    const event = (await api(`/families/${fid}/events`, { token: lea })).data.find((e) => e.id === cal.event_id);
    assert.equal(event.start.slice(0, 10), '2026-10-24');
    assert.equal(event.all_day, true);

    const b = await create({ title: 'Eis?' });
    await api(`${path}/${b.id}/respond`, { token: mama, method: 'POST', body: { decision: 'counter', note: 'Nach dem Essen' } });
    assert.equal((await api(`${path}/${b.id}/counter`, { token: lea, method: 'POST', body: { accept: false } })).data.status, 'withdrawn');

    const c = await create({ title: 'Noch eine Stunde zocken?', category: 'media' });
    const no = await api(`${path}/${c.id}/respond`, { token: mama, method: 'POST', body: { decision: 'decline', note: 'Morgen ist Schule' } });
    assert.equal(no.data.status, 'declined');
    assert.equal(pushes.at(-1)[1].title, 'Mama sagt Nein');
    assert.equal((await api(`${path}/${c.id}/calendar`, { token: lea, method: 'POST' })).status, 409);

    const d = await create({ title: 'Taschengeld?' });
    assert.equal((await api(`${path}/${d.id}/withdraw`, { token: mama, method: 'POST' })).status, 403);
    assert.equal((await api(`${path}/${d.id}/withdraw`, { token: lea, method: 'POST' })).data.status, 'withdrawn');
    assert.equal((await api(`${path}/${d.id}/respond`, { token: mama, method: 'POST', body: { decision: 'approve' } })).status, 409);

    assert.equal((await api(`${path}/${d.id}`, { token: papa, method: 'DELETE' })).status, 204, 'Eltern räumen auf');
    assert.equal((await api(path, { token: lea })).data.length, 3);
  });
});

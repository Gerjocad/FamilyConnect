import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { openDatabase } from '../src/db.js';
import { CATEGORIES, points, total } from '../src/kniffel.js';

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

describe('Kniffel online', () => {
  test('Punkte', () => {
    assert.equal(points('full', [2, 2, 3, 3, 3]), 25);
    assert.equal(points('small', [1, 3, 4, 2, 6]), 30);
    assert.equal(points('large', [6, 5, 4, 3, 2]), 40);
    assert.equal(points('kniffel', [4, 4, 4, 4, 4]), 50);
    assert.equal(points('three', [5, 5, 5, 1, 2]), 18);
    assert.equal(points('fours', [4, 4, 1, 4, 2]), 12);
    assert.equal(total({ ones: 3, twos: 6, threes: 9, fours: 12, fives: 15, sixes: 18, chance: 20 }), 63 + 35 + 20);
  });

  test('zu dritt: einladen, reihum würfeln und eintragen, Ende mit Bestenliste', async () => {
    const reg = async (name) => (await api('/auth/register', { method: 'POST', body: { name, email: `${name}@kniffel3.test`, password: 'geheim123' } })).data.token;
    const tokens = { Mama: await reg('Mama'), Lea: await reg('Lea'), Tom: await reg('Tom'), Oma: await reg('Oma') };
    const { data: fam } = await api('/families', { token: tokens.Mama, method: 'POST', body: { name: 'F' } });
    let joined;
    for (const n of ['Lea', 'Tom', 'Oma']) joined = (await api('/families/join', { token: tokens[n], method: 'POST', body: { code: fam.invite_code } })).data;
    const id = (n) => joined.members.find((m) => m.name === n).id;
    const k = `/families/${fam.id}/games/kniffel`;

    assert.equal((await api(k, { token: tokens.Mama, method: 'POST', body: { players: [] } })).status, 400);
    const { data: game } = await api(k, { token: tokens.Mama, method: 'POST', body: { players: [id('Lea'), id('Tom')] } });
    assert.deepEqual(game.players, [id('Mama'), id('Lea'), id('Tom')]);
    assert.deepEqual(sent.at(-1)[0], [id('Lea'), id('Tom')]);
    assert.equal(sent.at(-1)[1].title, '🎲 Mama lädt dich zu Kniffel ein');
    assert.equal((await api(`${k}/${game.id}`, { token: tokens.Oma })).status, 404, 'Oma spielt nicht mit');

    const order = ['Mama', 'Lea', 'Tom'];
    assert.equal((await api(`${k}/${game.id}/roll`, { token: tokens.Lea, method: 'POST' })).status, 409, 'Lea ist nicht dran');
    assert.equal((await api(`${k}/${game.id}/score`, { token: tokens.Mama, method: 'POST', body: { category: 'chance' } })).status, 409, 'erst würfeln');
    let state = (await api(`${k}/${game.id}/roll`, { token: tokens.Mama, method: 'POST' })).data;
    assert.ok(state.dice.every((d) => d >= 1 && d <= 6));
    const kept = state.dice[0];
    state = (await api(`${k}/${game.id}/roll`, { token: tokens.Mama, method: 'POST', body: { held: [true, false, false, false, false] } })).data;
    assert.equal(state.dice[0], kept, 'gehaltener Würfel bleibt');
    await api(`${k}/${game.id}/roll`, { token: tokens.Mama, method: 'POST' });
    assert.equal((await api(`${k}/${game.id}/roll`, { token: tokens.Mama, method: 'POST' })).status, 409, 'nur dreimal');

    // alle 13 Runden für alle drei durchspielen
    for (let round = 0; round < CATEGORIES.length; round++) {
      for (const [i, n] of order.entries()) {
        if (!(round === 0 && i === 0)) await api(`${k}/${game.id}/roll`, { token: tokens[n], method: 'POST' });
        state = (await api(`${k}/${game.id}/score`, { token: tokens[n], method: 'POST', body: { category: CATEGORIES[round] } })).data;
        if (round === 0 && i === 0) {
          assert.equal(state.current, 1, 'dann ist Lea dran');
          assert.equal(sent.at(-1)[0][0], id('Lea'));
          assert.equal((await api(`${k}/${game.id}/score`, { token: tokens.Lea, method: 'POST', body: { category: 'ones' } })).status, 409, 'Lea muss erst würfeln');
        }
      }
    }
    assert.equal(state.status, 'finished');
    assert.match(sent.at(-1)[1].title, /^🎲 Kniffel: (Mama|Lea|Tom) gewinnt mit \d+ Punkten$/);
    const best = (await api(`/families/${fam.id}/games/scores/kniffel`, { token: tokens.Oma })).data;
    assert.equal(best.length, 3);
    assert.deepEqual((await api(k, { token: tokens.Tom })).data.map((g) => g.id), [game.id]);
  });
});

import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { openDatabase } from '../src/db.js';
import { applyMove, emptyBoard, outcome } from '../src/games.js';
import { randomFleet, shoot, validateFleet } from '../src/battleship.js';

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
  return { status: res.status, data: res.status === 204 || res.status === 201 && res.headers.get('content-length') === '0' ? null : await res.json() };
}

describe('Spiele', () => {
  test('Regeln: Vier gewinnt fällt nach unten, Diagonale gewinnt, volle Spalte', () => {
    let b = emptyBoard('connect4');
    const drop = (p, col) => { b = applyMove('connect4', b, p, { col }).board; };
    drop(1, 0); drop(2, 1); drop(1, 1); drop(2, 2); drop(2, 2); drop(1, 2); drop(2, 3); drop(2, 3); drop(2, 3);
    assert.equal(outcome('connect4', b).winner, null);
    drop(1, 3);
    assert.deepEqual(outcome('connect4', b), { winner: 1, line: [[2, 3], [3, 2], [4, 1], [5, 0]] });
    let full = emptyBoard('connect4');
    for (let i = 0; i < 6; i++) full = applyMove('connect4', full, 1, { col: 6 }).board;
    assert.equal(applyMove('connect4', full, 2, { col: 6 }).error, 'Diese Spalte ist voll');
    const draw = [[1, 2, 1], [1, 2, 2], [2, 1, 1]];
    assert.equal(outcome('tictactoe', draw).winner, 'draw');
    assert.equal(applyMove('tictactoe', draw, 1, { row: 0, col: 0 }).error, 'Das Feld ist schon belegt');
  });

  test('Online-Partie: herausfordern, abwechselnd ziehen, gewinnen, Bilanz', async () => {
    const reg = async (name) => (await api('/auth/register', { method: 'POST', body: { name, email: `${name}@spiele.test`, password: 'geheim123' } })).data.token;
    const mama = await reg('Mama');
    const lea = await reg('Lea');
    const tom = await reg('Tom');
    const { data: fam } = await api('/families', { token: mama, method: 'POST', body: { name: 'F' } });
    await api('/families/join', { token: lea, method: 'POST', body: { code: fam.invite_code } });
    const { data: joined } = await api('/families/join', { token: tom, method: 'POST', body: { code: fam.invite_code } });
    const id = (n) => joined.members.find((m) => m.name === n).id;
    const g = `/families/${fam.id}/games`;

    assert.equal((await api(`${g}/matches`, { token: mama, method: 'POST', body: { game: 'schach', opponent: id('Lea') } })).status, 400);
    const { data: match } = await api(`${g}/matches`, { token: mama, method: 'POST', body: { game: 'tictactoe', opponent: id('Lea') } });
    assert.deepEqual(sent.at(-1), [[id('Lea')], { title: '❌ Mama fordert dich heraus', body: 'Tic-Tac-Toe – Mama fängt an', path: `/spiele/tictactoe/${match.id}` }]);
    const move = (token, row, col) => api(`${g}/matches/${match.id}/move`, { token, method: 'POST', body: { row, col } });
    assert.equal((await move(lea, 0, 0)).status, 409, 'Lea ist nicht dran');
    assert.equal((await move(tom, 0, 0)).status, 404, 'Tom spielt nicht mit');
    await move(mama, 0, 0);
    assert.equal((await move(lea, 0, 0)).status, 400, 'belegt');
    await move(lea, 1, 0);
    await move(mama, 0, 1);
    await move(lea, 1, 1);
    const pushes = sent.length;
    const { data: won } = await move(mama, 0, 2);
    assert.equal(won.winner, 1);
    assert.equal(won.status, 'finished');
    assert.deepEqual(won.line, [[0, 0], [0, 1], [0, 2]]);
    assert.equal(sent.length, pushes + 1);
    assert.equal(sent.at(-1)[1].title, '❌ Tic-Tac-Toe: Mama hat gewonnen');
    assert.equal((await move(lea, 2, 2)).status, 409, 'vorbei');

    const { data: c4 } = await api(`${g}/matches`, { token: lea, method: 'POST', body: { game: 'connect4', opponent: id('Mama') } });
    assert.equal((await api(`${g}/matches/${c4.id}/resign`, { token: mama, method: 'POST' })).data.winner, 1, 'Mama gibt auf → Lea gewinnt');
    const stats = (await api(`${g}/stats`, { token: lea })).data;
    assert.deepEqual(stats.map((s) => [s.game, s.won, s.lost]).sort(), [['connect4', 1, 0], ['tictactoe', 0, 1]]);
    assert.deepEqual((await api(`${g}/matches`, { token: tom })).data, []);
  });

  test('Memory-Bestenliste: bestes Ergebnis je Person', async () => {
    const reg = async (name) => (await api('/auth/register', { method: 'POST', body: { name, email: `${name}@memory.test`, password: 'geheim123' } })).data.token;
    const mama = await reg('Mama');
    const lea = await reg('Lea');
    const { data: fam } = await api('/families', { token: mama, method: 'POST', body: { name: 'F' } });
    await api('/families/join', { token: lea, method: 'POST', body: { code: fam.invite_code } });
    const g = `/families/${fam.id}/games`;
    assert.equal((await api(`${g}/scores`, { token: lea, method: 'POST', body: { game: 'memory', score: 0 } })).status, 400);
    for (const [token, score, seconds] of [[lea, 20, 60], [lea, 14, 90], [mama, 16, 40], [lea, 14, 70]]) {
      assert.equal((await api(`${g}/scores`, { token, method: 'POST', body: { game: 'memory', score, seconds } })).status, 201);
    }
    const best = (await api(`${g}/scores/memory`, { token: mama })).data;
    assert.deepEqual(best.map((b) => [b.score, b.seconds]), [[14, 70], [16, 40]]);
  });

  test('Schiffe versenken: Flotte prüfen, Zufallsflotte, Treffer und Versenken', () => {
    for (let i = 0; i < 50; i++) assert.equal(validateFleet(randomFleet()), null);
    const fleet = [
      { row: 0, col: 0, len: 5, vertical: false }, { row: 2, col: 0, len: 4, vertical: false },
      { row: 4, col: 0, len: 3, vertical: false }, { row: 6, col: 0, len: 3, vertical: false }, { row: 8, col: 0, len: 2, vertical: false },
    ];
    assert.equal(validateFleet(fleet), null);
    assert.equal(validateFleet(fleet.map((s, i) => (i === 1 ? { ...s, row: 1 } : s))), 'Schiffe dürfen sich nicht berühren');
    assert.equal(validateFleet(fleet.map((s, i) => (i === 0 ? { ...s, col: 6 } : s))), 'Ein Schiff ragt über den Rand');
    assert.equal(validateFleet(fleet.slice(1)), 'Falsche Anzahl Schiffe');
    assert.deepEqual(shoot(fleet, [], 9, 9), { hit: false, sunk: null, allSunk: false });
    assert.equal(shoot(fleet, [[8, 0]], 8, 1).sunk.len, 2);
    assert.equal(shoot(fleet, [[8, 0]], 8, 0).error, 'Da hast du schon hingeschossen');
  });

  test('Schiffe versenken online: verdeckte Flotten, Treffer = nochmal, gewinnen', async () => {
    const reg = async (name) => (await api('/auth/register', { method: 'POST', body: { name, email: `${name}@schiffe.test`, password: 'geheim123' } })).data.token;
    const mama = await reg('Mama');
    const lea = await reg('Lea');
    const { data: fam } = await api('/families', { token: mama, method: 'POST', body: { name: 'F' } });
    const { data: joined } = await api('/families/join', { token: lea, method: 'POST', body: { code: fam.invite_code } });
    const leaId = joined.members.find((m) => m.name === 'Lea').id;
    const g = `/families/${fam.id}/games/matches`;
    const { data: match } = await api(g, { token: mama, method: 'POST', body: { game: 'battleship', opponent: leaId } });
    assert.equal(match.status, 'setup');
    assert.equal(sent.at(-1)[1].body, 'Schiffe versenken – stell deine Schiffe auf!');
    const fleet = [
      { row: 0, col: 0, len: 5, vertical: false }, { row: 2, col: 0, len: 4, vertical: false },
      { row: 4, col: 0, len: 3, vertical: false }, { row: 6, col: 0, len: 3, vertical: false }, { row: 8, col: 0, len: 2, vertical: false },
    ];
    assert.equal((await api(`${g}/${match.id}/move`, { token: mama, method: 'POST', body: { row: 0, col: 0 } })).status, 409, 'erst aufstellen');
    assert.equal((await api(`${g}/${match.id}/ships`, { token: lea, method: 'POST', body: { ships: fleet.slice(1) } })).status, 400);
    await api(`${g}/${match.id}/ships`, { token: lea, method: 'POST', body: { ships: fleet } });
    const { data: mamaView } = await api(`${g}/${match.id}/ships`, { token: mama, method: 'POST', body: { random: true } });
    assert.equal(mamaView.status, 'active');
    assert.equal(mamaView.board.myShips.length, 5);
    assert.deepEqual(mamaView.board.revealed, [], 'Leas Schiffe sind verdeckt');
    assert.equal(JSON.stringify(mamaView).includes('"row":8'), mamaView.board.myShips.some((s) => s.row === 8), 'keine fremden Schiffe in der Antwort');

    const shot = (token, row, col) => api(`${g}/${match.id}/move`, { token, method: 'POST', body: { row, col } });
    let r = await shot(mama, 9, 9);
    assert.equal(r.data.shot.hit, false);
    assert.equal(r.data.turn, 2, 'Wasser → Lea ist dran');
    // Lea schießt daneben, Mama versenkt das U-Boot und darf weiter
    const empty = (() => {
      const taken = new Set(mamaView.board.myShips.flatMap((s) => Array.from({ length: s.len }, (_, i) => (s.vertical ? `${s.row + i},${s.col}` : `${s.row},${s.col + i}`))));
      for (let a = 0; a < 10; a++) for (let b = 0; b < 10; b++) if (!taken.has(`${a},${b}`)) return [a, b];
    })();
    await shot(lea, ...empty);
    r = await shot(mama, 8, 0);
    assert.equal(r.data.turn, 1, 'Treffer → nochmal');
    r = await shot(mama, 8, 1);
    assert.equal(r.data.shot.sunk, 2);
    assert.equal(r.data.board.revealed.length, 1, 'versenktes Schiff wird aufgedeckt');
    for (const s of fleet.slice(0, 4)) for (let i = 0; i < s.len; i++) r = await shot(mama, s.row, s.col + i);
    assert.equal(r.data.status, 'finished');
    assert.equal(r.data.winner, 1);
    assert.equal(sent.at(-1)[1].title, '🚢 Mama hat alle deine Schiffe versenkt');
    const leaView = (await api(`${g}/${match.id}`, { token: lea })).data;
    assert.equal(leaView.board.revealed.length, 5, 'am Ende sieht jeder alles');
    assert.equal(leaView.board.theirShots.filter((x) => x[2]).length, 17);
  });

  test('Kniffel-Bestenliste: meiste Punkte, auch für Mitspieler am selben Handy', async () => {
    const reg = async (name) => (await api('/auth/register', { method: 'POST', body: { name, email: `${name}@kniffel.test`, password: 'geheim123' } })).data.token;
    const mama = await reg('Mama');
    const lea = await reg('Lea');
    const { data: fam } = await api('/families', { token: mama, method: 'POST', body: { name: 'F' } });
    const { data: joined } = await api('/families/join', { token: lea, method: 'POST', body: { code: fam.invite_code } });
    const leaId = joined.members.find((m) => m.name === 'Lea').id;
    const g = `/families/${fam.id}/games/scores`;
    await api(g, { token: mama, method: 'POST', body: { game: 'kniffel', score: 180 } });
    await api(g, { token: mama, method: 'POST', body: { game: 'kniffel', score: 240, user_id: leaId } });
    await api(g, { token: mama, method: 'POST', body: { game: 'kniffel', score: 150, user_id: leaId } });
    assert.equal((await api(g, { token: mama, method: 'POST', body: { game: 'kniffel', score: 100, user_id: 9999 } })).status, 400);
    assert.deepEqual((await api(`${g}/kniffel`, { token: lea })).data.map((b) => [b.user_id, b.score]), [[leaId, 240], [joined.members.find((m) => m.name === 'Mama').id, 180]]);
  });
});

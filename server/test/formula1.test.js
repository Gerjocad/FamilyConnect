import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { openDatabase } from '../src/db.js';
import { Formula1Service, germanRaceName } from '../src/formula1.js';
import { localKey } from '../src/occurrences.js';

const today = new Date();
const todayKey = localKey(today);
const races = {
  MRData: { RaceTable: { Races: [
    { round: '1', raceName: 'Australian Grand Prix', date: '2026-03-08', time: '04:00:00Z', Circuit: { circuitName: 'Albert Park', Location: { locality: 'Melbourne', country: 'Australia' } }, Qualifying: { date: '2026-03-07', time: '05:00:00Z' } },
    { round: '2', raceName: 'Mexico City Grand Prix', date: todayKey, time: '23:30:00Z', Circuit: { circuitName: 'Hermanos Rodríguez', Location: { locality: 'Mexico City', country: 'Mexico' } }, Sprint: {} },
  ] } },
};
let calls = 0;
const formula1 = new Formula1Service({ fetchImpl: async () => { calls++; return Response.json(races); } });

let server;
let base;
before(async () => {
  const app = createApp(openDatabase(':memory:'), { formula1 });
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

describe('Formel 1', () => {
  test('deutsche Namen', () => {
    assert.equal(germanRaceName('Australian Grand Prix'), 'GP Australien');
    assert.equal(germanRaceName('São Paulo Grand Prix'), 'GP Brasilien');
    assert.equal(germanRaceName('Las Vegas Grand Prix'), 'GP Las Vegas');
    assert.equal(germanRaceName('Fantasy Grand Prix'), 'GP Fantasy');
    assert.equal(germanRaceName('Brazilian Grand Prix'), 'GP Brasilien');
    assert.equal(germanRaceName('Bahrain Grand Prix in Malaysia'), 'GP Bahrain in Malaysia');
  });

  test('Saison in Ortszeit, zwischengespeichert', async () => {
    const list = await formula1.season(2026);
    const melbourne = list[0];
    assert.equal(melbourne.name, 'GP Australien');
    assert.equal(melbourne.flag, '🇦🇺');
    const start = new Date('2026-03-08T04:00:00Z');
    assert.equal(melbourne.date, localKey(start));
    assert.equal(melbourne.time, `${String(start.getHours()).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')}`);
    assert.equal(list[1].sprint, true);
    const before = calls;
    await formula1.season(2026);
    assert.equal(calls, before, 'aus dem Zwischenspeicher');
  });

  test('einschalten, Kalender und Wanddisplay', async () => {
    const mama = (await api('/auth/register', { method: 'POST', body: { name: 'Mama', email: 'f1@x.test', password: 'geheim123' } })).data.token;
    const { data: fam } = await api('/families', { token: mama, method: 'POST', body: { name: 'Yumruk' } });
    const f = `/families/${fam.id}`;
    assert.equal(fam.show_f1, false);
    assert.deepEqual((await api(`${f}/formula1?year=2026`, { token: mama })).data, [], 'ausgeschaltet → nichts');
    assert.equal((await api(f, { token: mama, method: 'PATCH', body: { show_f1: 'ja' } })).status, 400);
    assert.equal((await api(f, { token: mama, method: 'PATCH', body: { show_f1: true } })).data.show_f1, true);
    assert.equal((await api(`${f}/formula1?year=2026`, { token: mama })).data.length, 2);

    const { data: wall } = await api(`${f}/wall-displays`, { token: mama, method: 'POST', body: { name: 'Flur' } });
    const { data: view } = await api(`/wall/${wall.token}`);
    const race = list(view).find((s) => s.kind === 'f1');
    // Mexiko 23:30 UTC ist in Deutschland schon der nächste Tag – je nach Zeitzone heute oder morgen
    assert.ok(race, 'Rennen heute oder morgen auf dem Wanddisplay');
    assert.match(race.text, /^🇲🇽 GP Mexiko · \d\d:\d\d Uhr$/);
  });
});

const list = (view) => view.days.flatMap((d) => d.special);

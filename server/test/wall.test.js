import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { openDatabase } from '../src/db.js';
import { localKey } from '../src/occurrences.js';
import { WeatherService } from '../src/weather.js';
import { weatherHints } from '../src/wall.js';

let server;
let base;
before(async () => {
  const weather = new WeatherService({ fetchImpl: async () => Response.json({ current: {}, daily: { time: [] }, hourly: { time: [] } }) });
  const app = createApp(openDatabase(':memory:'), { weather });
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

describe('Wanddisplay', () => {
  test('Link anlegen, Übersicht ohne Anmeldung, widerrufen', async () => {
    const reg = async (name) => (await api('/auth/register', { method: 'POST', body: { name, email: `${name}@wand.test`, password: 'geheim123' } })).data.token;
    const mama = await reg('Mama');
    const lea = await reg('Lea');
    const { data: fam } = await api('/families', { token: mama, method: 'POST', body: { name: 'Yumruk' } });
    await api('/families/join', { token: lea, method: 'POST', body: { code: fam.invite_code } });
    const f = `/families/${fam.id}`;
    assert.equal((await api(`${f}/wall-displays`, { token: lea, method: 'POST', body: {} })).status, 403);
    const { data: wall } = await api(`${f}/wall-displays`, { token: mama, method: 'POST', body: { name: 'Küche' } });
    assert.equal(wall.name, 'Küche');
    assert.match(wall.token, /^[A-HJ-NP-Z2-9]{12}$/);

    const today = localKey(new Date());
    const lastWeek = localKey(new Date(Date.now() - 7 * 86_400_000));
    await api(`${f}/events`, { token: mama, method: 'POST', body: { title: 'Fenerbahçe – Galatasaray', start: `${today}T20:00`, end: `${today}T22:00` } });
    await api(`${f}/events`, { token: mama, method: 'POST', body: { title: 'Schwimmen', start: `${lastWeek}T16:00`, end: `${lastWeek}T17:00`, recurrence: 'weekly' } });
    await api(`${f}/event-icons`, { token: mama, method: 'POST', body: { keyword: 'Fenerbahce', image: 'data:image/png;base64,AAAA' } });
    await api(`${f}/posts`, { token: lea, method: 'POST', body: { text: 'Hallo Wand!' } });

    const dashed = `${wall.token.slice(0, 4)}-${wall.token.slice(4, 8)}-${wall.token.slice(8)}`.toLowerCase();
    const { status, data } = await api(`/wall/${dashed}`);
    assert.equal(status, 200);
    assert.equal(data.family, 'Yumruk');
    assert.deepEqual(data.days[0].events.map((e) => [e.title, e.start.slice(11)]), [['Schwimmen', '16:00'], ['Fenerbahçe – Galatasaray', '20:00']]);
    assert.equal(data.days[0].events[1].icon, 'data:image/png;base64,AAAA');
    assert.equal(data.posts[0].text, 'Hallo Wand!');
    assert.equal(data.weather, null);
    assert.equal(data.members.length, 2);
    assert.equal(data.members[0].email, undefined, 'keine Kontaktdaten');
    assert.ok((await api(`${f}/wall-displays`, { token: mama })).data[0].last_seen_at);

    assert.equal((await api(`${f}/wall-displays/${wall.id}`, { token: mama, method: 'DELETE' })).status, 204);
    assert.equal((await api(`/wall/${wall.token}`)).status, 404);
  });

  test('Wetter-Hinweise', () => {
    const now = new Date(2026, 9, 21, 12, 0);
    const hours = [12, 13, 14, 15, 16].map((h) => ({ time: `2026-10-21T${h}:00`, temp: 10, rain: h >= 15 ? 80 : 10, code: h >= 15 ? 61 : 2 }));
    const todays = [{ event: { title: 'Training', all_day: false }, start: new Date(2026, 9, 21, 16, 0) }];
    assert.deepEqual(weatherHints({ hours, days: [{ date: '2026-10-21', min: -1, max: 5 }] }, now, todays), [
      'Regen ab ca. 15 Uhr – Regenjacke einpacken',
      '„Training“ um 16 Uhr: wahrscheinlich Regen',
      'Frost – warm anziehen',
    ]);
  });
});

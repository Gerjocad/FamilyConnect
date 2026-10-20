import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { openDatabase } from '../src/db.js';
import { WeatherService } from '../src/weather.js';

const urls = [];
async function fakeMeteo(url) {
  urls.push(url);
  const u = new URL(url);
  if (u.host === 'geocoding-api.open-meteo.com') {
    return Response.json({ results: [{ name: 'Düsseldorf', admin1: 'Nordrhein-Westfalen', country: 'Deutschland', latitude: 51.22172, longitude: 6.77616 }] });
  }
  return Response.json({
    current: { temperature_2m: 12.4, weather_code: 3 },
    daily: { time: ['2026-10-21', '2026-10-22'], weather_code: [61, 1], temperature_2m_max: [14.2, 16.8], temperature_2m_min: [7.6, 6.1], precipitation_probability_max: [80, 10] },
    hourly: { time: ['2026-10-21T15:00', '2026-10-21T16:00'], temperature_2m: [13.1, 12.6], precipitation_probability: [40, 75], weather_code: [3, 61] },
  });
}

let server;
let base;
before(async () => {
  const app = createApp(openDatabase(':memory:'), { weather: new WeatherService({ fetchImpl: fakeMeteo }) });
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
    method: 'POST', body: { name, email: `${name}${n}@wunsch.test`, password: 'geheim123' },
  })).data.token;
  const mama = await reg('Mama');
  const lea = await reg('Lea');
  const tom = await reg('Tom');
  const { data: fam } = await api('/families', { token: mama, method: 'POST', body: { name: 'F' } });
  await api('/families/join', { token: lea, method: 'POST', body: { code: fam.invite_code } });
  const { data: joined } = await api('/families/join', { token: tom, method: 'POST', body: { code: fam.invite_code } });
  return { mama, lea, tom, fid: fam.id, ids: Object.fromEntries(joined.members.map((m) => [m.name, m.id])) };
}

describe('Wunschliste', () => {
  test('wer etwas besorgt, bleibt für den Wünschenden geheim', async () => {
    const { mama, lea, tom, fid, ids } = await family();
    const path = `/families/${fid}/wishes`;
    const { status, data: wish } = await api(path, { token: lea, method: 'POST', body: { title: 'Lego Eiskönigin', link: 'https://example.com/lego', price: '40 €' } });
    assert.equal(status, 201);
    assert.equal(wish.owner_id, ids.Lea);
    assert.equal((await api(path, { token: lea, method: 'POST', body: { title: 'X', link: 'javascript:alert(1)' } })).status, 400);
    assert.equal((await api(path, { token: lea, method: 'POST', body: { title: 'Für Tom', owner_id: ids.Tom } })).status, 403, 'Kinder nur für sich');

    assert.equal((await api(`${path}/${wish.id}/reserve`, { token: lea, method: 'POST' })).status, 403, 'nicht die eigenen');
    const reserved = await api(`${path}/${wish.id}/reserve`, { token: mama, method: 'POST' });
    assert.equal(reserved.data.reserved_by, ids.Mama);
    assert.equal((await api(`${path}/${wish.id}/reserve`, { token: tom, method: 'POST' })).status, 409);

    // Tom sieht, dass Mama es besorgt; Lea sieht nichts davon
    assert.equal((await api(path, { token: tom })).data[0].reserved_by, ids.Mama);
    const forLea = (await api(path, { token: lea })).data[0];
    assert.equal(forLea.reserved_by, null);
    assert.equal(forLea.reserved_at, null);
    const edited = await api(`${path}/${wish.id}`, { token: lea, method: 'PATCH', body: { price: '45 €' } });
    assert.equal(edited.data.reserved_by, null, 'auch nicht in der Antwort aufs Bearbeiten');
    assert.equal(edited.data.title, 'Lego Eiskönigin');

    assert.equal((await api(`${path}/${wish.id}/reserve`, { token: tom, method: 'DELETE' })).status, 403, 'nur wer es übernommen hat');
    assert.equal((await api(`${path}/${wish.id}/reserve`, { token: mama, method: 'DELETE' })).data.reserved_by, null);
    assert.equal((await api(`${path}/${wish.id}`, { token: tom, method: 'DELETE' })).status, 403);
    assert.equal((await api(`${path}/${wish.id}`, { token: lea, method: 'DELETE' })).status, 204);
  });
});

describe('Wetter', () => {
  test('Ort suchen, speichern, Vorhersage', async () => {
    const { mama, lea, fid } = await family();
    assert.deepEqual((await api(`/families/${fid}/weather`, { token: lea })).data, { place: null });
    const { data: places } = await api(`/families/${fid}/weather/places?q=Düsseldorf`, { token: mama });
    assert.deepEqual(places[0], { name: 'Düsseldorf', region: 'Nordrhein-Westfalen', country: 'Deutschland', lat: 51.222, lon: 6.776 });

    assert.equal((await api(`/families/${fid}`, { token: mama, method: 'PATCH', body: { weather: { name: 'X', lat: 200, lon: 0 } } })).status, 400);
    const { data: fam } = await api(`/families/${fid}`, { token: mama, method: 'PATCH', body: { weather: { name: 'Düsseldorf', lat: 51.222, lon: 6.776 } } });
    assert.equal(fam.weather_place, 'Düsseldorf');

    const { data: w } = await api(`/families/${fid}/weather`, { token: lea });
    assert.equal(w.place, 'Düsseldorf');
    assert.deepEqual(w.current, { temp: 12, code: 3 });
    assert.deepEqual(w.days[0], { date: '2026-10-21', code: 61, max: 14, min: 8, rain: 80 });
    assert.deepEqual(w.hours[1], { time: '2026-10-21T16:00', temp: 13, rain: 75, code: 61 });
    assert.match(urls.at(-1), /latitude=51\.222&longitude=6\.776&timezone=Europe%2FBerlin/);

    const before = urls.length;
    await api(`/families/${fid}/weather`, { token: mama });
    assert.equal(urls.length, before, 'zwischengespeichert');
    assert.equal((await api(`/families/${fid}`, { token: mama, method: 'PATCH', body: { weather: null } })).data.weather_place, null);
  });
});

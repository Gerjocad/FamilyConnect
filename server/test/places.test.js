import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { openDatabase } from '../src/db.js';
import { checkPendingExits, Geocoder, inWindow } from '../src/places.js';

const sent = [];
let push;
const inMinutes = (m) => new Date(Date.now() + m * 60_000);
let server;
let base;
let db;
before(async () => {
  db = openDatabase(':memory:');
  const geocoder = new Geocoder({
    fetchImpl: async (url) => {
      assert.match(url, /nominatim\.openstreetmap\.org\/search\?format=jsonv2/);
      return Response.json([{ display_name: 'Grundschule am Park, Parkstraße 3, 40210 Düsseldorf', lat: '51.2212345', lon: '6.7801234' }]);
    },
  });
  push = { notify: (ids, m) => sent.push([ids, m]), handleChange() {} };
  const app = createApp(db, { geocoder, push });
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

describe('Orte', () => {
  test('anlegen, teilen, Wünsche, Meldungen mit Entprellung', async () => {
    const reg = async (name) => (await api('/auth/register', { method: 'POST', body: { name, email: `${name}@ort.test`, password: 'geheim123' } })).data.token;
    const mama = await reg('Mama');
    const papa = await reg('Papa');
    const lea = await reg('Lea');
    const { data: fam } = await api('/families', { token: mama, method: 'POST', body: { name: 'F' } });
    await api('/families/join', { token: papa, method: 'POST', body: { code: fam.invite_code } });
    const { data: joined } = await api('/families/join', { token: lea, method: 'POST', body: { code: fam.invite_code } });
    const ids = Object.fromEntries(joined.members.map((m) => [m.name, m.id]));
    const path = `/families/${fam.id}/places`;
    // Papa zum Elternteil machen
    await api(`/families/${fam.id}/members/${ids.Papa}`, { token: mama, method: 'PATCH', body: { role: 'parent' } });

    const { data: found } = await api(`${path}/search?q=Grundschule am Park`, { token: mama });
    assert.deepEqual(found[0], { label: 'Grundschule am Park, Parkstraße 3, 40210 Düsseldorf', lat: 51.221235, lon: 6.780123 });
    assert.equal((await api(path, { token: lea, method: 'POST', body: { name: 'X', lat: 1, lon: 1 } })).status, 403, 'Kinder legen keine Orte an');
    assert.equal((await api(path, { token: mama, method: 'POST', body: { name: 'Schule', lat: 1, lon: 1, radius: 5 } })).status, 400, 'Radius zu klein');
    const { data: school } = await api(path, { token: mama, method: 'POST', body: { name: 'Schule', icon: '🏫', address: found[0].label, lat: found[0].lat, lon: found[0].lon } });
    assert.equal(school.radius, 50, 'Standard 50 m');

    // Mama möchte wissen, wann Lea ankommt (nur Mo–Fr); Papa auch beim Losgehen
    assert.equal((await api(`${path}/prefs`, { token: mama, method: 'PUT', body: { prefs: [{ member_id: ids.Mama, place_id: school.id, arrive: true }] } })).status, 400, 'nicht über sich selbst');
    await api(`${path}/prefs`, { token: mama, method: 'PUT', body: { prefs: [{ member_id: ids.Lea, place_id: school.id, arrive: true, leave: false }] } });
    await api(`${path}/prefs`, { token: papa, method: 'PUT', body: { prefs: [{ member_id: ids.Lea, place_id: school.id, arrive: true, leave: true }] } });

    const event = (body) => api(`${path}/events`, { token: lea, method: 'POST', body: { place_id: school.id, ...body } });
    assert.equal((await event({ transition: 'enter' })).status, 409, 'ohne Teilen keine Meldung');
    await api(`${path}/sharing`, { token: lea, method: 'PUT', body: { enabled: true } });

    // direkt nach dem Anmelden: schon da → nur merken
    assert.equal((await event({ transition: 'enter', initial: true })).data.notified, 0);
    let overview = (await api(path, { token: mama })).data;
    assert.deepEqual(overview.presence.map((p) => [p.user_id, p.place_id]), [[ids.Lea, school.id]]);
    assert.deepEqual(overview.sharing, [ids.Lea]);
    assert.deepEqual(overview.prefs, [{ member_id: ids.Lea, place_id: school.id, arrive: true, leave: false, weekdays_only: false, from_time: null, to_time: null }]);

    // GPS springt kurz aus dem Kreis und zurück → weder „losgegangen“ noch „angekommen“
    const count = sent.length;
    assert.deepEqual((await event({ transition: 'exit' })).data, { notified: 0, pending: true });
    assert.equal((await event({ transition: 'enter' })).data.notified, 0);
    assert.equal(checkPendingExits(db, { push }, inMinutes(10)), 0);
    assert.equal(sent.length, count, 'keine Meldung bei GPS-Sprung');
    assert.equal((await api(path, { token: mama })).data.presence.length, 1, 'gilt weiter als da');

    // wirklich losgegangen: erst nach ein paar Minuten bestätigt, mit der Uhrzeit des Losgehens
    assert.equal((await event({ transition: 'exit' })).data.pending, true);
    assert.equal((await event({ transition: 'exit' })).data.pending, true, 'doppelt – bleibt vorgemerkt');
    assert.equal(checkPendingExits(db, { push }, inMinutes(2)), 0, 'noch zu früh');
    assert.equal(sent.length, count);
    assert.equal(checkPendingExits(db, { push }, inMinutes(6)), 1);
    assert.equal(sent.at(-1)[1].title, '🏫 Lea ist losgegangen');
    assert.deepEqual(sent.at(-1)[0], [ids.Papa], 'nur Papa will Losgehen wissen');
    assert.equal((await event({ transition: 'exit' })).data.notified, 0, 'doppelt');
    overview = (await api(path, { token: mama })).data;
    assert.deepEqual(overview.presence, []);
    assert.deepEqual(overview.away.map((a) => [a.user_id, a.place_id]), [[ids.Lea, school.id]], 'unterwegs seit dem Losgehen');
    const arrived = await event({ transition: 'enter' });
    assert.equal(arrived.data.notified, 2);
    assert.match(sent.at(-1)[1].body, /^Schule · \d\d:\d\d$/);
    await event({ transition: 'exit' });
    assert.equal((await event({ transition: 'enter' })).data.notified, 0, 'innerhalb von 10 Minuten nicht nochmal');

    // Teilen aus → nicht mehr sichtbar
    await api(`${path}/sharing`, { token: lea, method: 'PUT', body: { enabled: false } });
    overview = (await api(path, { token: mama })).data;
    assert.deepEqual(overview.presence, []);
    assert.equal((await api(`${path}/${school.id}`, { token: mama, method: 'DELETE' })).status, 204);
  });

  test('Zeitfenster', () => {
    const mon8 = new Date(2026, 9, 19, 8, 0);
    const sat8 = new Date(2026, 9, 24, 8, 0);
    assert.equal(inWindow({ weekdays_only: 1 }, sat8), false);
    assert.equal(inWindow({ weekdays_only: 1, from_time: '07:00', to_time: '09:00' }, mon8), true);
    assert.equal(inWindow({ from_time: '12:00', to_time: '16:00' }, mon8), false);
    assert.equal(inWindow({ from_time: '22:00', to_time: '06:00' }, new Date(2026, 9, 19, 23, 30)), true, 'über Mitternacht');
  });
});

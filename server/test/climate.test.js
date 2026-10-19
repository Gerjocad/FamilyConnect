import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';
import { createApp } from '../src/app.js';
import { checkClimateAlerts } from '../src/climate.js';
import { openDatabase } from '../src/db.js';
import { TuyaClient } from '../src/tuya.js';

const CONFIG = { access_id: 'testid123', access_secret: 'geheimnis456', region: 'eu' };
const readings = { 'dev-kinder': { temp: 215, hum: 48, battery: 80 } };
let expired = false;

/** Nachgebaute Tuya-Cloud: prüft die Signatur wie das Original */
async function fakeTuya(url, options) {
  const u = new URL(url);
  assert.equal(u.origin, 'https://openapi.tuyaeu.com');
  const path = u.pathname + u.search;
  const h = options.headers;
  const body = options.body ?? '';
  const stringToSign = [options.method, createHash('sha256').update(body).digest('hex'), '', path].join('\n');
  const expected = createHmac('sha256', CONFIG.access_secret)
    .update(CONFIG.access_id + (h.access_token ?? '') + h.t + h.nonce + stringToSign).digest('hex').toUpperCase();
  const reply = (result) => new Response(JSON.stringify({ success: true, result }));
  if (h.client_id !== CONFIG.access_id || h.sign !== expected) return new Response(JSON.stringify({ success: false, code: 1004, msg: 'sign invalid' }));
  if (path === '/v1.0/token?grant_type=1') return reply({ access_token: 'tok-1', expire_time: 7200, uid: 'u1' });
  if (h.access_token !== 'tok-1') return new Response(JSON.stringify({ success: false, code: 1010, msg: 'token invalid' }));
  if (expired) return new Response(JSON.stringify({ success: false, code: 28841105, msg: 'No permissions. Your subscription to cloud development plan has expired.' }));
  // wie im echten Projekt: die v2-Liste will device_ids, die Geräte kommen über das verknüpfte App-Konto
  if (path === '/v2.0/cloud/thing/device?page_size=50') return new Response(JSON.stringify({ success: false, code: 1109, msg: 'device_ids param is illegal, please check it' }));
  if (path === '/v1.0/iot-01/associated-users/devices?size=50') {
    return reply({ devices: [{ id: 'dev-kinder', name: 'Thermometer 1', category: 'wsdcg', online: true }], has_more: true, last_row_key: 'abc' });
  }
  if (path === '/v1.0/iot-01/associated-users/devices?last_row_key=abc&size=50') {
    return reply({ devices: [{ id: 'dev-steckdose', name: 'Steckdose', category: 'cz', online: false }], has_more: false });
  }
  const m = /^\/v1\.0\/iot-03\/devices\/([\w-]+)\/(status|specification)$/.exec(path);
  if (m && m[2] === 'specification') {
    return reply({ status: [{ code: 'va_temperature', values: '{"unit":"℃","scale":1}' }, { code: 'va_humidity', values: '{"unit":"%","scale":0}' }] });
  }
  if (m) {
    const r = readings[m[1]];
    return reply([{ code: 'va_temperature', value: r.temp }, { code: 'va_humidity', value: r.hum }, { code: 'battery_percentage', value: r.battery }]);
  }
  return new Response(JSON.stringify({ success: false, code: 1108, msg: 'uri path invalid' }));
}

let server;
let base;
let db;
before(async () => {
  db = openDatabase(':memory:');
  const app = createApp(db, { tuya: new TuyaClient({ config: CONFIG, fetchImpl: fakeTuya }) });
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

describe('Raumklima (Tuya)', () => {
  test('Geräte wählen, Werte lesen, Grenzwerte, Warnungen', async () => {
    const reg = async (name) => (await api('/auth/register', { method: 'POST', body: { name, email: `${name}@klima.test`, password: 'geheim123' } })).data.token;
    const mama = await reg('Mama');
    const lea = await reg('Lea');
    const { data: fam } = await api('/families', { token: mama, method: 'POST', body: { name: 'F' } });
    await api('/families/join', { token: lea, method: 'POST', body: { code: fam.invite_code } });
    const path = `/families/${fam.id}/climate`;

    assert.deepEqual((await api(path, { token: lea })).data, { enabled: true, sensors: [] });
    assert.equal((await api(`${path}/devices`, { token: lea })).status, 403, 'nur Admins');
    const { data: list } = await api(`${path}/devices`, { token: mama });
    assert.deepEqual(list.devices.map((d) => [d.id, d.selected, d.online]), [['dev-kinder', false, true], ['dev-steckdose', false, false]]);

    assert.equal((await api(`${path}/devices`, { token: mama, method: 'PUT', body: { devices: [{ id: 'dev-kinder', max_humidity: 'viel' }] } })).status, 400);
    assert.equal((await api(`${path}/devices`, { token: mama, method: 'PUT', body: {
      devices: [{ id: 'dev-kinder', label: 'Kinderzimmer', min_temp: 18, max_temp: 24, max_humidity: 60 }],
    } })).status, 204);

    const { data } = await api(path, { token: lea });
    assert.equal(data.sensors.length, 1);
    const s = data.sensors[0];
    assert.equal(s.label, 'Kinderzimmer');
    assert.equal(s.temperature, 21.5, 'Kommastelle aus der Gerätebeschreibung');
    assert.equal(s.humidity, 48);
    assert.equal(s.battery, 80);
    assert.deepEqual(s.warnings, []);

    // Warnung nur bei neuer Überschreitung, und nur an Eltern/Admins
    const pushes = [];
    const push = { notify: (ids, m) => pushes.push([ids, m]) };
    const client = new TuyaClient({ config: CONFIG, fetchImpl: fakeTuya });
    readings['dev-kinder'] = { temp: 215, hum: 72, battery: 80 };
    await checkClimateAlerts(db, client, push);
    assert.equal(pushes.length, 1);
    assert.match(pushes[0][1].body, /72 % Luftfeuchtigkeit – bitte lüften/);
    assert.equal(pushes[0][1].title, '🌡️ Kinderzimmer');
    assert.equal(pushes[0][0].length, 1, 'Lea ist Kind und bekommt keine Warnung');
    await checkClimateAlerts(db, new TuyaClient({ config: CONFIG, fetchImpl: fakeTuya }), push);
    assert.equal(pushes.length, 1, 'keine Wiederholung');
    readings['dev-kinder'] = { temp: 215, hum: 50, battery: 80 };
    await checkClimateAlerts(db, new TuyaClient({ config: CONFIG, fetchImpl: fakeTuya }), push);
    readings['dev-kinder'] = { temp: 160, hum: 75, battery: 10 };
    await checkClimateAlerts(db, new TuyaClient({ config: CONFIG, fetchImpl: fakeTuya }), push);
    assert.equal(pushes.length, 2, 'wieder normal → erneute Überschreitung wird gemeldet');
    assert.match(pushes[1][1].body, /zu kalt.*lüften.*Batterie/);
  });

  test('abgelaufene Testphase wird erkannt', async () => {
    expired = true;
    try {
      const client = new TuyaClient({ config: CONFIG, fetchImpl: fakeTuya });
      await assert.rejects(client.devices(), { expired: true, message: /Testphase ist abgelaufen/ });
    } finally {
      expired = false;
    }
  });

  test('ohne Zugangsdaten aus', () => {
    assert.equal(new TuyaClient({ configFile: '/gibt/es/nicht.json' }).enabled, false);
  });
});

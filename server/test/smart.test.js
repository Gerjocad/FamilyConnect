import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { openDatabase } from '../src/db.js';
import { TuyaClient } from '../src/tuya.js';

const CONFIG = { access_id: 'id', access_secret: 'secret', region: 'eu' };
const points = {
  'lampe-1': [{ code: 'switch_led', value: false }, { code: 'bright_value_v2', value: 505 }, { code: 'work_mode', value: 'white' }],
  'dose-1': [{ code: 'switch_1', value: true }, { code: 'countdown_1', value: 0 }],
};
const commands = [];

/** Nachgebaute Tuya-Cloud (ohne Signaturprüfung – die testet climate.test.js) */
async function fakeTuya(url, options) {
  const path = new URL(url).pathname + new URL(url).search;
  const reply = (result) => new Response(JSON.stringify({ success: true, result }));
  if (path === '/v1.0/token?grant_type=1') return reply({ access_token: 't', expire_time: 7200 });
  if (path === '/v1.0/iot-01/associated-users/devices?size=50') {
    return reply({ devices: [
      { id: 'lampe-1', name: 'Wohnzimmer Lampe', category: 'dj', online: true },
      { id: 'dose-1', name: 'Steckdose TV', category: 'cz', online: true },
      { id: 'thermo-1', name: 'Thermometer', category: 'wsdcg', online: true },
    ], has_more: false });
  }
  const m = /^\/v1\.0\/iot-03\/devices\/([\w-]+)\/(status|specification|commands)$/.exec(path);
  if (m?.[2] === 'specification') {
    return reply({ functions: m[1] === 'lampe-1' ? [{ code: 'bright_value_v2', values: '{"min":10,"max":1000,"scale":0,"step":1}' }] : [], status: [] });
  }
  if (m?.[2] === 'status') return reply(points[m[1]]);
  if (m?.[2] === 'commands') {
    const body = JSON.parse(options.body);
    commands.push([m[1], body.commands]);
    for (const c of body.commands) points[m[1]].find((p) => p.code === c.code).value = c.value;
    return reply(true);
  }
  return new Response(JSON.stringify({ success: false, code: 1108, msg: 'uri path invalid' }));
}

let server;
let base;
before(async () => {
  const app = createApp(openDatabase(':memory:'), { tuya: new TuyaClient({ config: CONFIG, fetchImpl: fakeTuya }) });
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

describe('Smart Home (Tuya)', () => {
  test('Geräte wählen, schalten, dimmen, Rechte der Kinder', async () => {
    const reg = async (name) => (await api('/auth/register', { method: 'POST', body: { name, email: `${name}@smart.test`, password: 'geheim123' } })).data.token;
    const mama = await reg('Mama');
    const lea = await reg('Lea');
    const { data: fam } = await api('/families', { token: mama, method: 'POST', body: { name: 'F' } });
    await api('/families/join', { token: lea, method: 'POST', body: { code: fam.invite_code } });
    const path = `/families/${fam.id}/smart`;

    assert.equal((await api(`${path}/devices`, { token: lea })).status, 403);
    const { data: list } = await api(`${path}/devices`, { token: mama });
    assert.deepEqual(list.devices.map((d) => [d.id, d.kind]), [['lampe-1', 'light'], ['dose-1', 'plug']], 'ohne Thermometer');

    assert.equal((await api(`${path}/devices`, { token: mama, method: 'PUT', body: { devices: [
      { id: 'lampe-1', label: 'Kinderzimmer', kind: 'light', kids_allowed: true },
      { id: 'dose-1', label: 'Fernseher', kind: 'plug' },
    ] } })).status, 204);

    const { data } = await api(path, { token: mama });
    assert.deepEqual(data.devices.map((d) => [d.label, d.on, d.brightness, d.dimmable]), [['Kinderzimmer', false, 50, true], ['Fernseher', true, null, false]]);

    // Kind sieht und schaltet nur die freigegebene Lampe
    const kid = await api(path, { token: lea });
    assert.deepEqual(kid.data.devices.map((d) => d.label), ['Kinderzimmer']);
    assert.equal((await api(`${path}/dose-1`, { token: lea, method: 'POST', body: { on: false } })).status, 403);
    assert.equal((await api(`${path}/lampe-1`, { token: lea, method: 'POST', body: { on: true, brightness: 100 } })).status, 204);
    assert.deepEqual(commands.at(-1), ['lampe-1', [{ code: 'switch_led', value: true }, { code: 'bright_value_v2', value: 1000 }]]);

    assert.equal((await api(`${path}/dose-1`, { token: mama, method: 'POST', body: { on: false } })).status, 204);
    assert.deepEqual(commands.at(-1), ['dose-1', [{ code: 'switch_1', value: false }]]);
    assert.equal((await api(`${path}/dose-1`, { token: mama, method: 'POST', body: { brightness: 50 } })).status, 502, 'Steckdose nicht dimmbar');
    assert.equal((await api(`${path}/dose-1`, { token: mama, method: 'POST', body: { on: 'ja' } })).status, 400);
    assert.equal((await api(`${path}/gibtsnicht`, { token: mama, method: 'POST', body: { on: true } })).status, 404);

    const after = await api(path, { token: mama });
    assert.deepEqual(after.data.devices.map((d) => [d.on, d.brightness]), [[true, 100], [false, null]], 'neuer Zustand sofort sichtbar');
  });
});

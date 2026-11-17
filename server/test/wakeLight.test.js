import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { openDatabase } from '../src/db.js';
import { checkTimes, phaseAt } from '../src/wakeLight.js';

let server;
let base;
const today = new Date();
const key = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
// Feiertag: morgen (damit „morgen frei“ auch an Werktagen geprüft werden kann)
const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1, 12);
const holidays = { forYear: async () => ({ public: [{ date: key(tomorrow), name: 'Testfeiertag' }], school: [] }) };

before(async () => {
  const app = createApp(openDatabase(':memory:'), { holidays });
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

test('Phasen der Nacht', () => {
  const t = { moon: 19 * 60, dawn: 6 * 60 + 15, sun: 6 * 60 + 30, off: 7 * 60 + 30 };
  const n = { moon: 20 * 60, dawn: 7 * 60, sun: 7 * 60 + 30, off: 8 * 60 + 30 };
  assert.equal(phaseAt(t, n, 3 * 60).phase, 'moon');
  assert.deepEqual(phaseAt(t, n, 6 * 60 + 20), { phase: 'dawn', progress: 1 / 3 });
  assert.equal(phaseAt(t, n, 7 * 60).phase, 'sun');
  assert.equal(phaseAt(t, n, 12 * 60).phase, 'off');
  assert.equal(phaseAt(t, n, 19 * 60 + 30).phase, 'off', 'morgen ist frei → Mond erst um 20 Uhr');
  assert.equal(phaseAt(t, n, 20 * 60).phase, 'moon');
  assert.match(checkTimes({ moon: '19:00', dawn: '07:00', sun: '06:30', off: '08:00' }), /vor der Sonne/);
  assert.match(checkTimes({ moon: '09:00', dawn: '06:00', sun: '06:30', off: '08:00' }), /abends/);
  assert.equal(checkTimes({ moon: '19:00', dawn: '06:00', sun: '06:30', off: '08:00' }), null);
});

test('Schlaflicht anlegen, einstellen, Gerät holt den Plan', async () => {
  const reg = async (name) => (await api('/auth/register', { method: 'POST', body: { name, email: `${name}@wake.test`, password: 'geheim123' } })).data.token;
  const mama = await reg('Mama');
  const { data: fam } = await api('/families', { token: mama, method: 'POST', body: { name: 'F' } });
  await api(`/families/${fam.id}`, { token: mama, method: 'PATCH', body: { state: 'NW' } });
  const path = `/families/${fam.id}/wake-lights`;

  const { status, data: light } = await api(path, { token: mama, method: 'POST', body: { name: 'Emirs Licht' } });
  assert.equal(status, 201);
  assert.equal(light.school.sun, '06:30');
  assert.equal(light.online, false);

  assert.equal((await api(`${path}/${light.id}`, { token: mama, method: 'PATCH', body: { school: { moon: '19:00', dawn: '07:00', sun: '06:30', off: '08:00' } } })).status, 400);
  assert.equal((await api(`${path}/${light.id}`, { token: mama, method: 'PATCH', body: { sun_brightness: 150 } })).status, 400);
  const { data: saved } = await api(`${path}/${light.id}`, { token: mama, method: 'PATCH', body: {
    school: { moon: '19:15', dawn: '06:20', sun: '06:40', off: '07:45' }, free: { moon: '20:00', dawn: '07:10', sun: '07:30', off: '09:00' },
    sun_brightness: 70, moon_brightness: 0,
  } });
  assert.equal(saved.school.dawn, '06:20');
  assert.equal(saved.moon_brightness, 0);

  assert.equal((await fetch(`${base}/wake-light/FALSCH`)).status, 404);
  const plan = await (await fetch(`${base}/wake-light/${light.token.toLowerCase()}?v=1.0`)).json();
  assert.equal(plan.nights.length, 2);
  assert.equal(plan.nights[1].date, key(tomorrow));
  assert.equal(plan.nights[1].sun, 7 * 60 + 30, 'morgen Feiertag → Zeiten für freie Tage');
  const weekend = [0, 6].includes(today.getDay());
  assert.equal(plan.nights[0].sun, weekend ? 7 * 60 + 30 : 6 * 60 + 40);
  assert.equal(plan.sun_brightness, 70);
  assert.equal(plan.test, null);

  await api(`${path}/${light.id}/test`, { token: mama, method: 'POST', body: { show: 'sun' } });
  const withTest = await (await fetch(`${base}/wake-light/${light.token}`)).json();
  assert.equal(withTest.test.show, 'sun');
  assert.ok(withTest.test.seconds > 50);

  const [listed] = (await api(path, { token: mama })).data;
  assert.equal(listed.online, true);
  assert.equal(listed.firmware, '1.0');
  assert.ok(['moon', 'dawn', 'sun', 'off'].includes(listed.phase));
});

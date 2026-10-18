import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createApp } from '../src/app.js';
import { nextDueDate, todayKey } from '../src/dates.js';
import { openDatabase } from '../src/db.js';
import { joinGerman, PushService } from '../src/push.js';

// --- Hilfen -----------------------------------------------------------------

const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const fakeAccount = {
  project_id: 'familyconnect-test',
  client_email: 'push@familyconnect-test.iam.gserviceaccount.com',
  private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }),
  token_uri: 'https://oauth.test/token',
  fcm_endpoint: 'https://fcm.test/send',
};

const sent = [];
let unregistered = new Set();
async function fakeFetch(url, init) {
  if (url === fakeAccount.token_uri) {
    const params = new URLSearchParams(init.body);
    assert.equal(params.get('assertion').split('.').length, 3);
    return Response.json({ access_token: 'tok', expires_in: 3600 });
  }
  const body = JSON.parse(init.body);
  if (unregistered.has(body.message.token)) {
    return new Response('{"error":{"status":"NOT_FOUND","details":[{"errorCode":"UNREGISTERED"}]}}', { status: 404 });
  }
  sent.push(body.message);
  return Response.json({ name: 'ok' });
}

let server;
let base;
let db;

before(async () => {
  db = openDatabase(':memory:');
  const push = new PushService(db, fakeAccount, { fetchImpl: fakeFetch, batchDelayMs: 600 });
  const app = createApp(db, { push });
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
    method: 'POST', body: { name, email: `${name}${n}@f.test`, password: 'geheim123' },
  })).data.token;
  const anna = await reg('Anna');
  const ben = await reg('Ben');
  const { data: fam } = await api('/families', { token: anna, method: 'POST', body: { name: 'F' } });
  await api('/families/join', { token: ben, method: 'POST', body: { code: fam.invite_code } });
  const { data } = await api(`/families/${fam.id}`, { token: anna });
  const id = (name) => data.members.find((m) => m.name === name).id;
  return { anna, ben, fid: fam.id, annaId: id('Anna'), benId: id('Ben') };
}

const waitFor = async (fn, ms = 8000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (fn()) return;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error('Zeitüberschreitung');
};

// --- Tests ------------------------------------------------------------------

describe('Wiederkehrende Aufgaben', () => {
  test('nächstes Fälligkeitsdatum liegt immer nach heute', () => {
    assert.equal(nextDueDate('2026-10-20', 'weekly', '2026-10-20'), '2026-10-27');
    assert.equal(nextDueDate('2026-10-06', 'weekly', '2026-10-20'), '2026-10-27'); // überfällig
    assert.equal(nextDueDate('2026-10-18', 'daily', '2026-10-20'), '2026-10-21');
    assert.equal(nextDueDate('2026-01-31', 'monthly', '2026-01-31'), '2026-02-28');
    assert.equal(nextDueDate('2026-01-31', 'monthly', '2026-03-01'), '2026-03-31'); // Monatsende bleibt erhalten
    assert.equal(nextDueDate('2028-02-29', 'yearly', '2028-02-29'), '2029-02-28');
    assert.equal(nextDueDate(null, 'weekly', '2026-10-20'), '2026-10-27');
  });

  test('Abhaken rückt die Aufgabe vor statt sie zu erledigen', async () => {
    const { anna, fid } = await family();
    const { data: task } = await api(`/families/${fid}/tasks`, {
      token: anna, method: 'POST', body: { title: 'Müll', recurrence: 'weekly', due_date: '2020-01-07' },
    });
    const { data: done } = await api(`/families/${fid}/tasks/${task.id}`, { token: anna, method: 'PATCH', body: { done: true } });
    assert.equal(done.done, false);
    assert.ok(done.due_date > todayKey(), 'nächster Termin liegt in der Zukunft');
    assert.equal((new Date(done.due_date) - new Date('2020-01-07')) / 86_400_000 % 7, 0, 'bleibt auf dem Wochentag');
    // Einmalige Aufgaben werden normal erledigt
    const { data: once } = await api(`/families/${fid}/tasks`, { token: anna, method: 'POST', body: { title: 'Einmal' } });
    const { data: onceDone } = await api(`/families/${fid}/tasks/${once.id}`, { token: anna, method: 'PATCH', body: { done: true } });
    assert.equal(onceDone.done, true);
  });
});

describe('Termin-Serien und Erinnerungen', () => {
  test('Ausnahmen, Serienende und Erinnerung werden gespeichert und geprüft', async () => {
    const { anna, fid } = await family();
    const { data: ev } = await api(`/families/${fid}/events`, {
      token: anna, method: 'POST',
      body: { title: 'Training', start: '2026-10-06T17:00', end: '2026-10-06T18:30', recurrence: 'weekly', reminder_minutes: 30 },
    });
    assert.deepEqual(ev.exdates, []);
    assert.equal(ev.until, null);
    assert.equal(ev.reminder_minutes, 30);

    const { data: patched } = await api(`/families/${fid}/events/${ev.id}`, {
      token: anna, method: 'PATCH', body: { exdates: ['2026-10-20', '2026-10-13', '2026-10-20'], until: '2026-12-31' },
    });
    assert.deepEqual(patched.exdates, ['2026-10-13', '2026-10-20']);
    assert.equal(patched.until, '2026-12-31');

    const bad = async (body) => (await api(`/families/${fid}/events/${ev.id}`, { token: anna, method: 'PATCH', body })).status;
    assert.equal(await bad({ exdates: ['kein-datum'] }), 400);
    assert.equal(await bad({ until: '2026-01-01' }), 400);
    assert.equal(await bad({ reminder_minutes: 7 }), 400);
    assert.equal(await bad({ reminder_minutes: null }), 200);
  });

  test('bestehende Datenbanken bekommen die neuen Spalten', () => {
    const dir = mkdtempSync(join(tmpdir(), 'fc-'));
    try {
      const file = join(dir, 'alt.db');
      const old = new DatabaseSync(file);
      old.exec(`CREATE TABLE events (id INTEGER PRIMARY KEY, family_id INTEGER NOT NULL, title TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '', location TEXT NOT NULL DEFAULT '', start TEXT NOT NULL, end TEXT NOT NULL,
        all_day INTEGER NOT NULL DEFAULT 0, recurrence TEXT NOT NULL DEFAULT 'none', member_ids TEXT NOT NULL DEFAULT '[]',
        created_by INTEGER, created_at TEXT NOT NULL DEFAULT (datetime('now')));
        INSERT INTO events (family_id, title, start, end) VALUES (1, 'Alt', '2026-01-01T10:00', '2026-01-01T11:00');`);
      old.close();
      const migrated = openDatabase(file);
      const row = migrated.prepare('SELECT * FROM events').get();
      assert.equal(row.title, 'Alt');
      assert.equal(row.exdates, '[]');
      assert.equal(row.reminder_minutes, null);
      assert.ok(migrated.prepare("SELECT name FROM sqlite_master WHERE name = 'devices'").get());
      migrated.close();
      openDatabase(file).close(); // zweiter Start ändert nichts
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('Push-Benachrichtigungen', () => {
  test('Pinnwand, Termine, Aufgaben und gebündelte Listeneinträge', async () => {
    const { anna, ben, fid, benId } = await family();
    await api('/devices', { token: ben, method: 'POST', body: { token: 'ben-handy' } });
    await api('/devices', { token: anna, method: 'POST', body: { token: 'anna-handy' } });
    sent.length = 0;

    await api(`/families/${fid}/posts`, { token: anna, method: 'POST', body: { text: 'Hallo zusammen' } });
    await waitFor(() => sent.length === 1);
    assert.equal(sent[0].token, 'ben-handy', 'nicht an die Absenderin');
    assert.equal(sent[0].notification.title, 'Anna auf der Pinnwand');
    assert.equal(sent[0].data.path, '/pinnwand');

    await api(`/families/${fid}/events`, {
      token: anna, method: 'POST', body: { title: 'Zahnarzt', start: '2026-10-20T15:30', end: '2026-10-20T16:00' },
    });
    await waitFor(() => sent.length === 2);
    assert.match(sent[1].notification.body, /^Zahnarzt · .*20.*15:30 Uhr \(von Anna\)$/);

    await api(`/families/${fid}/tasks`, { token: anna, method: 'POST', body: { title: 'Rasen mähen', assignee_id: benId } });
    await waitFor(() => sent.length === 3);
    assert.equal(sent[2].notification.title, 'Neue Aufgabe für dich');

    const { data: list } = await api(`/families/${fid}/lists`, { token: anna, method: 'POST', body: { name: 'Einkauf' } });
    // nacheinander, aber ohne Pause – auch ein langsamer Server bleibt im Bündelungsfenster
    for (const text of ['Milch', 'Brot', 'Eier']) {
      await api(`/families/${fid}/items`, { token: anna, method: 'POST', body: { list_id: list.id, text } });
    }
    await waitFor(() => sent.length === 4);
    await new Promise((r) => setTimeout(r, 800));
    assert.equal(sent.length, 4, 'nur eine Nachricht für drei Einträge');
    assert.equal(sent[3].notification.title, 'Einkauf');
    assert.equal(sent[3].notification.body, 'Anna hat Milch, Brot und Eier hinzugefügt');
  });

  test('abgemeldete Geräte werden entfernt', async () => {
    const { anna, ben, fid } = await family();
    await api('/devices', { token: ben, method: 'POST', body: { token: 'altes-handy' } });
    unregistered = new Set(['altes-handy']);
    await api(`/families/${fid}/posts`, { token: anna, method: 'POST', body: { text: 'Hallo?' } });
    await waitFor(() => !db.prepare("SELECT 1 FROM devices WHERE token = 'altes-handy'").get());
    unregistered = new Set();
  });

  test('Gerät abmelden', async () => {
    const { ben } = await family();
    await api('/devices', { token: ben, method: 'POST', body: { token: 'weg' } });
    await api('/devices/unregister', { token: ben, method: 'POST', body: { token: 'weg' } });
    assert.equal(db.prepare("SELECT 1 FROM devices WHERE token = 'weg'").get(), undefined);
  });

  test('Aufzählungen', () => {
    assert.equal(joinGerman(['Milch']), 'Milch');
    assert.equal(joinGerman(['Milch', 'Brot']), 'Milch und Brot');
    assert.equal(joinGerman(['a', 'b', 'c', 'd', 'e']), 'a, b, c und 2 weitere');
  });
});

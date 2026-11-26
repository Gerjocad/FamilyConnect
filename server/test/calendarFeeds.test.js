import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { openDatabase } from '../src/db.js';
import { parseFeed } from '../src/calendarFeeds.js';

// wie auf dem Server: deutsche Zeit (Node übernimmt TZ auch zur Laufzeit)
process.env.TZ = 'Europe/Berlin';

const pad = (n) => String(n).padStart(2, '0');
const now = new Date();
const ymd = (d) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
const inDays = (n) => new Date(now.getFullYear(), now.getMonth(), now.getDate() + n);
// nächster Montag (mind. 2 Tage hin)
const monday = inDays(((8 - now.getDay()) % 7) + 7);

const TZ = `BEGIN:VTIMEZONE
TZID:Europe/Berlin
BEGIN:DAYLIGHT
TZOFFSETFROM:+0100
TZOFFSETTO:+0200
TZNAME:CEST
DTSTART:19700329T020000
RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU
END:DAYLIGHT
BEGIN:STANDARD
TZOFFSETFROM:+0200
TZOFFSETTO:+0100
TZNAME:CET
DTSTART:19701025T030000
RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU
END:STANDARD
END:VTIMEZONE`;

const familyIcs = `BEGIN:VCALENDAR
VERSION:2.0
X-WR-CALNAME:Familie
${TZ}
BEGIN:VEVENT
UID:turnen@google.com
DTSTART;TZID=Europe/Berlin:${ymd(monday)}T170000
DTEND;TZID=Europe/Berlin:${ymd(monday)}T180000
RRULE:FREQ=WEEKLY;BYDAY=MO,WE;COUNT=6
EXDATE;TZID=Europe/Berlin:${ymd(inDays(((8 - now.getDay()) % 7) + 9))}T170000
SUMMARY:Turnen
END:VEVENT
BEGIN:VEVENT
UID:turnen@google.com
RECURRENCE-ID;TZID=Europe/Berlin:${ymd(inDays(((8 - now.getDay()) % 7) + 14))}T170000
DTSTART;TZID=Europe/Berlin:${ymd(inDays(((8 - now.getDay()) % 7) + 14))}T183000
DTEND;TZID=Europe/Berlin:${ymd(inDays(((8 - now.getDay()) % 7) + 14))}T193000
SUMMARY:Turnen (später)
END:VEVENT
BEGIN:VEVENT
UID:urlaub@google.com
DTSTART;VALUE=DATE:${ymd(inDays(20))}
DTEND;VALUE=DATE:${ymd(inDays(23))}
SUMMARY:Urlaub
END:VEVENT
BEGIN:VEVENT
UID:abgesagt@google.com
DTSTART:${ymd(inDays(3))}T100000Z
DTEND:${ymd(inDays(3))}T110000Z
STATUS:CANCELLED
SUMMARY:Abgesagt
END:VEVENT
END:VCALENDAR`;

const privateIcs = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:arzt@google.com
DTSTART:${ymd(inDays(2))}T080000Z
DTEND:${ymd(inDays(2))}T090000Z
SUMMARY:Arzttermin
END:VEVENT
END:VCALENDAR`;

let feeds = { 'https://calendar.google.com/familie.ics': familyIcs, 'https://calendar.google.com/privat.ics': privateIcs };
const fakeFetch = async (url) => (feeds[url] ? new Response(feeds[url]) : new Response('nicht da', { status: 404 }));

let server;
let base;
before(async () => {
  const app = createApp(openDatabase(':memory:'), { calendarFetch: fakeFetch });
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

test('iCal: Serien, Ausnahmen, gelöschte und ganztägige Termine', () => {
  const { name, events } = parseFeed(familyIcs, inDays(-1), inDays(60));
  assert.equal(name, 'Familie');
  const turnen = events.filter((e) => e.title.startsWith('Turnen'));
  assert.equal(turnen.length, 5, '6 Termine, einer per EXDATE gestrichen');
  assert.equal(turnen[0].start, `${ymd(monday).replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3')}T17:00`, 'Ortszeit Berlin');
  const moved = turnen.find((e) => e.title === 'Turnen (später)');
  assert.ok(moved.start.endsWith('T18:30'));
  const urlaub = events.find((e) => e.title === 'Urlaub');
  assert.equal(urlaub.all_day, true);
  assert.ok(urlaub.end.endsWith('T23:59'));
  assert.ok(!events.some((e) => e.title === 'Abgesagt'));
});

test('Verbundene Kalender: Sichtbarkeit, nur ansehen, Abgleich', async () => {
  const reg = async (name) => (await api('/auth/register', { method: 'POST', body: { name, email: `${name}@feed.test`, password: 'geheim123' } })).data.token;
  const papa = await reg('Papa');
  const mama = await reg('Mama');
  const kind = await reg('Kind');
  const { data: fam } = await api('/families', { token: papa, method: 'POST', body: { name: 'F' } });
  for (const t of [mama, kind]) await api('/families/join', { token: t, method: 'POST', body: { code: fam.invite_code } });
  const me = async (t) => (await api('/me', { token: t })).data.id;
  const mamaId = await me(mama);
  const path = `/families/${fam.id}/calendar-feeds`;

  assert.equal((await api(path, { token: papa, method: 'POST', body: { name: 'x', url: 'http://unsicher', visibility: 'private' } })).status, 400);
  const fam1 = await api(path, { token: papa, method: 'POST', body: { name: 'Familie', url: 'https://calendar.google.com/familie.ics', visibility: 'family' } });
  assert.equal(fam1.status, 201);
  assert.equal(fam1.data.sync.ok, true);
  const priv = await api(path, { token: papa, method: 'POST', body: { name: 'Privat', url: 'webcal://calendar.google.com/privat.ics', visibility: 'private' } });
  assert.equal(priv.data.sync.count, 1);

  const titles = async (t) => (await api(`/families/${fam.id}/events`, { token: t })).data.map((e) => e.title);
  assert.ok((await titles(papa)).includes('Arzttermin'));
  assert.ok(!(await titles(mama)).includes('Arzttermin'), 'privat: nur Papa');
  assert.ok((await titles(mama)).includes('Urlaub'), 'Familie: alle');
  assert.deepEqual((await api(path, { token: mama })).data, [], 'fremde Kalender (und deren Adresse) sieht man nicht');

  // ausgewählte Personen
  await api(`${path}/${priv.data.id}`, { token: papa, method: 'PATCH', body: { visibility: 'custom', viewer_ids: [mamaId] } });
  assert.ok((await titles(mama)).includes('Arzttermin'));
  assert.ok(!(await titles(kind)).includes('Arzttermin'));
  assert.equal((await api(`${path}/${priv.data.id}`, { token: mama, method: 'PATCH', body: { visibility: 'family' } })).status, 404, 'nur der Besitzer');

  // nur ansehen
  const urlaub = (await api(`/families/${fam.id}/events`, { token: papa })).data.find((e) => e.title === 'Urlaub');
  assert.equal(urlaub.feed_id, fam1.data.id);
  assert.equal((await api(`/families/${fam.id}/events/${urlaub.id}`, { token: papa, method: 'PATCH', body: { title: 'x' } })).status, 403);
  assert.equal((await api(`/families/${fam.id}/events/${urlaub.id}`, { token: papa, method: 'DELETE' })).status, 403);

  // Abgleich: Termin in Google gelöscht, neuer dazu, Adresse ungültig
  feeds['https://calendar.google.com/privat.ics'] = privateIcs.replace('Arzttermin', 'Zahnarzt');
  const synced = await api(`${path}/${priv.data.id}/sync`, { token: papa, method: 'POST' });
  assert.equal(synced.data.sync.ok, true);
  assert.ok((await titles(papa)).includes('Zahnarzt'));
  assert.ok(!(await titles(papa)).includes('Arzttermin'));
  feeds = {};
  const broken = await api(`${path}/${priv.data.id}/sync`, { token: papa, method: 'POST' });
  assert.match(broken.data.last_error, /kennt diese Adresse nicht/);
  assert.ok((await titles(papa)).includes('Zahnarzt'), 'bei Fehler bleiben die Termine');

  // Kalender entfernen → Termine weg
  assert.equal((await api(`${path}/${priv.data.id}`, { token: papa, method: 'DELETE' })).status, 204);
  assert.ok(!(await titles(papa)).includes('Zahnarzt'));
});

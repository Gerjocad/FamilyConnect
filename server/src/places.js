// Orte (Zuhause, Schule, Arbeit …) mit „angekommen / losgegangen“.
// Die Android-App meldet Orte als Geofences beim System an; Android meldet Betreten/Verlassen,
// die App schickt nur „Ort + angekommen/verlassen“ hierher – keine Koordinaten, kein Verlauf.
// Wer worüber Bescheid bekommt, legt jede Person selbst fest (place_prefs).
import { Router } from 'express';
import { isManager } from './permissions.js';

const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
const MIN_RADIUS = 30;
const MAX_RADIUS = 2000;
// gleiche Meldung (Person, Ort, angekommen/verlassen) frühestens nach so vielen Minuten erneut
const REPEAT_MINUTES = 10;
// „Verlassen“ erst melden, wenn man so lange wirklich draußen bleibt: Im Haus springt der GPS-Standort manchmal
// kurz aus dem Kreis und wieder hinein – das soll weder „losgegangen“ noch „angekommen“ auslösen
export const EXIT_CONFIRM_MINUTES = 5;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Adresssuche über OpenStreetMap (Nominatim, kostenlos; höchstens 1 Anfrage/Sekunde) */
export class Geocoder {
  #fetch;
  #last = 0;

  constructor({ fetchImpl = fetch } = {}) {
    this.#fetch = fetchImpl;
  }

  async search(query) {
    const wait = this.#last + 1100 - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    this.#last = Date.now();
    const url = `${NOMINATIM}?format=jsonv2&limit=5&accept-language=de&q=${encodeURIComponent(query)}`;
    const res = await this.#fetch(url, { headers: { 'User-Agent': 'FamilyConnect (private Familien-App)', Accept: 'application/json' }, signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`Adresssuche antwortet mit ${res.status}`);
    const data = await res.json();
    return (Array.isArray(data) ? data : []).map((r) => ({
      label: r.display_name,
      lat: Math.round(Number(r.lat) * 1e6) / 1e6,
      lon: Math.round(Number(r.lon) * 1e6) / 1e6,
    }));
  }
}

const pad = (n) => String(n).padStart(2, '0');
const sqlNow = (d = new Date()) => d.toISOString().slice(0, 19).replace('T', ' ');
const minutesSince = (sql, now) => (now.getTime() - new Date(`${sql.replace(' ', 'T')}Z`).getTime()) / 60_000;

/** Passt die Uhrzeit zum Zeitfenster eines Wunsches? (Server läuft in der Zeitzone der Familie) */
export function inWindow(pref, now = new Date()) {
  const day = now.getDay();
  if (pref.weekdays_only && (day === 0 || day === 6)) return false;
  if (!pref.from_time || !pref.to_time) return true;
  const t = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  return pref.from_time <= pref.to_time ? t >= pref.from_time && t <= pref.to_time : t >= pref.from_time || t <= pref.to_time;
}

/** Benachrichtigt alle, die über diesen Wechsel Bescheid wollen; liefert die Empfänger */
function notifyTransition(db, push, { familyId, userId, place, enter, at, now }) {
  const recipients = db.prepare(
    `SELECT pp.* FROM place_prefs pp JOIN memberships m ON m.user_id = pp.user_id AND m.family_id = pp.family_id
     WHERE pp.family_id = ? AND pp.member_id = ? AND pp.place_id = ? AND ${enter ? 'pp.arrive' : 'pp.leave'} = 1`
  ).all(familyId, userId, place.id).filter((p) => inWindow(p, now)).map((p) => p.user_id);
  const who = db.prepare('SELECT name FROM users WHERE id = ?').get(userId).name.split(' ')[0];
  const time = `${pad(at.getHours())}:${pad(at.getMinutes())}`;
  push?.notify?.(recipients, {
    title: enter ? `${place.icon} ${who} ist angekommen` : `${place.icon} ${who} ist losgegangen`,
    body: enter ? `${place.name} · ${time}` : `${place.name} verlassen · ${time}`,
    path: '/einstellungen#orte',
  });
  return recipients;
}

/**
 * Vorgemerkte „Verlassen“-Meldungen bestätigen, wenn niemand zurückgekommen ist (läuft jede Minute).
 * Gemeldet wird mit der Uhrzeit des tatsächlichen Losgehens.
 */
export function checkPendingExits(db, { push, publish }, now = new Date()) {
  const due = db.prepare(
    `SELECT pp.*, p.family_id FROM place_presence pp JOIN places p ON p.id = pp.place_id
     WHERE pp.pending_exit_at IS NOT NULL AND pp.pending_exit_at <= ?`
  ).all(sqlNow(new Date(now.getTime() - EXIT_CONFIRM_MINUTES * 60_000)));
  const families = new Set();
  for (const row of due) {
    const place = db.prepare('SELECT * FROM places WHERE id = ?').get(row.place_id);
    const sharing = db.prepare('SELECT share_places FROM memberships WHERE family_id = ? AND user_id = ?').get(row.family_id, row.user_id)?.share_places;
    const tooSoon = row.notified_exit_at && minutesSince(row.notified_exit_at, now) < REPEAT_MINUTES;
    const notify = Boolean(sharing) && !tooSoon;
    db.prepare(
      `UPDATE place_presence SET inside = 0, changed_at = pending_exit_at, pending_exit_at = NULL,
         notified_exit_at = CASE WHEN ? THEN ? ELSE notified_exit_at END WHERE user_id = ? AND place_id = ?`
    ).run(notify ? 1 : 0, sqlNow(now), row.user_id, row.place_id);
    if (notify) {
      const at = new Date(`${row.pending_exit_at.replace(' ', 'T')}Z`);
      notifyTransition(db, push, { familyId: row.family_id, userId: row.user_id, place, enter: false, at, now });
    }
    families.add(row.family_id);
  }
  for (const f of families) publish?.(f, 'places');
  return due.length;
}

export function placesRouter(db, { auth, member, publish, push, geocoder = new Geocoder() }) {
  const router = Router();
  const base = '/api/families/:familyId/places';
  const managersOnly = (req, res, next) =>
    isManager(req.role) ? next() : res.status(403).json({ error: 'Orte legen die Eltern an' });

  const find = (req, id = req.params.id) => db.prepare('SELECT * FROM places WHERE family_id = ? AND id = ?').get(req.familyId, Number(id));
  const serialize = (p) => ({ id: p.id, name: p.name, icon: p.icon, address: p.address, lat: p.lat, lon: p.lon, radius: p.radius });

  /** Felder aus dem Formular prüfen; liefert Fehlermeldung oder Werte */
  const fields = (body, current = {}) => {
    const v = { ...current, ...body };
    const name = typeof v.name === 'string' ? v.name.trim().slice(0, 50) : '';
    if (!name) return 'Bitte gib dem Ort einen Namen';
    const lat = Number(v.lat);
    const lon = Number(v.lon);
    if (!(Math.abs(lat) <= 90) || !(Math.abs(lon) <= 180)) return 'Bitte eine Adresse suchen oder den aktuellen Standort nehmen';
    const radius = Math.round(Number(v.radius ?? 50));
    if (!(radius >= MIN_RADIUS && radius <= MAX_RADIUS)) return `Der Radius muss zwischen ${MIN_RADIUS} und ${MAX_RADIUS} m liegen`;
    const icon = typeof v.icon === 'string' && v.icon.trim() ? [...v.icon.trim()].slice(0, 2).join('') : '📍';
    const address = typeof v.address === 'string' ? v.address.trim().slice(0, 300) : '';
    return { name, icon, address, lat, lon, radius };
  };

  // Alles für die Einstellungen: Orte, wer teilt, wer gerade wo ist, meine Benachrichtigungen
  router.get(base, auth, member, (req, res) => {
    checkPendingExits(db, { push, publish });
    const places = db.prepare('SELECT * FROM places WHERE family_id = ? ORDER BY name COLLATE NOCASE').all(req.familyId);
    const sharing = db.prepare('SELECT user_id FROM memberships WHERE family_id = ? AND share_places = 1').all(req.familyId).map((r) => r.user_id);
    const presence = db.prepare(
      `SELECT pp.user_id, pp.place_id, pp.changed_at FROM place_presence pp JOIN places p ON p.id = pp.place_id
       JOIN memberships m ON m.user_id = pp.user_id AND m.family_id = p.family_id AND m.share_places = 1
       WHERE p.family_id = ? AND pp.inside = 1`
    ).all(req.familyId);
    const prefs = db.prepare('SELECT member_id, place_id, arrive, leave, weekdays_only, from_time, to_time FROM place_prefs WHERE family_id = ? AND user_id = ?')
      .all(req.familyId, req.user.id)
      .map((p) => ({ ...p, arrive: Boolean(p.arrive), leave: Boolean(p.leave), weekdays_only: Boolean(p.weekdays_only) }));
    // Wer zuletzt irgendwo losgegangen ist und seitdem nirgends angekommen ist (letzte 12 Stunden)
    const inside = new Set(presence.map((p) => p.user_id));
    const away = db.prepare(
      `SELECT pp.user_id, pp.place_id, MAX(pp.changed_at) AS changed_at FROM place_presence pp JOIN places p ON p.id = pp.place_id
       JOIN memberships m ON m.user_id = pp.user_id AND m.family_id = p.family_id AND m.share_places = 1
       WHERE p.family_id = ? AND pp.inside = 0 AND pp.changed_at >= datetime('now', '-12 hours') GROUP BY pp.user_id`
    ).all(req.familyId).filter((a) => !inside.has(a.user_id));
    res.json({ places: places.map(serialize), sharing, presence, away, prefs });
  });

  router.get(`${base}/search`, auth, member, managersOnly, async (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 200) : '';
    if (q.length < 3) return res.json([]);
    try {
      res.json(await geocoder.search(q));
    } catch {
      res.status(502).json({ error: 'Adresssuche gerade nicht erreichbar' });
    }
  });

  router.post(base, auth, member, managersOnly, (req, res) => {
    const f = fields(req.body);
    if (typeof f === 'string') return res.status(400).json({ error: f });
    const { lastInsertRowid } = db.prepare('INSERT INTO places (family_id, name, icon, address, lat, lon, radius, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(req.familyId, f.name, f.icon, f.address, f.lat, f.lon, f.radius, req.user.id);
    publish(req.familyId, 'places');
    res.status(201).json(serialize(find(req, lastInsertRowid)));
  });

  router.patch(`${base}/:id`, auth, member, managersOnly, (req, res) => {
    const row = find(req);
    if (!row) return res.status(404).json({ error: 'Ort nicht gefunden' });
    const f = fields(req.body, row);
    if (typeof f === 'string') return res.status(400).json({ error: f });
    db.prepare('UPDATE places SET name = ?, icon = ?, address = ?, lat = ?, lon = ?, radius = ? WHERE id = ?')
      .run(f.name, f.icon, f.address, f.lat, f.lon, f.radius, row.id);
    publish(req.familyId, 'places');
    res.json(serialize(find(req)));
  });

  router.delete(`${base}/:id`, auth, member, managersOnly, (req, res) => {
    const { changes } = db.prepare('DELETE FROM places WHERE family_id = ? AND id = ?').run(req.familyId, Number(req.params.id));
    if (!changes) return res.status(404).json({ error: 'Ort nicht gefunden' });
    publish(req.familyId, 'places');
    res.status(204).end();
  });

  // Eigene Ankunft/Abfahrt teilen – entscheidet jeder selbst
  router.put(`${base}/sharing`, auth, member, (req, res) => {
    const enabled = Boolean(req.body?.enabled);
    db.prepare('UPDATE memberships SET share_places = ? WHERE family_id = ? AND user_id = ?').run(enabled ? 1 : 0, req.familyId, req.user.id);
    if (!enabled) {
      db.prepare('DELETE FROM place_presence WHERE user_id = ? AND place_id IN (SELECT id FROM places WHERE family_id = ?)').run(req.user.id, req.familyId);
    }
    publish(req.familyId, 'places');
    res.json({ enabled });
  });

  // Meine Benachrichtigungen komplett ersetzen: [{ member_id, place_id, arrive, leave, weekdays_only, from_time, to_time }]
  router.put(`${base}/prefs`, auth, member, (req, res) => {
    const list = Array.isArray(req.body?.prefs) ? req.body.prefs : null;
    if (!list || list.length > 500) return res.status(400).json({ error: 'Ungültige Angaben' });
    const members = new Set(db.prepare('SELECT user_id FROM memberships WHERE family_id = ?').all(req.familyId).map((r) => r.user_id));
    const places = new Set(db.prepare('SELECT id FROM places WHERE family_id = ?').all(req.familyId).map((r) => r.id));
    const rows = [];
    for (const p of list) {
      if (!members.has(p?.member_id) || !places.has(p?.place_id) || p.member_id === req.user.id) return res.status(400).json({ error: 'Unbekannte Person oder unbekannter Ort' });
      const from = p.from_time || null;
      const to = p.to_time || null;
      if ((from && !TIME_RE.test(from)) || (to && !TIME_RE.test(to)) || Boolean(from) !== Boolean(to)) return res.status(400).json({ error: 'Bitte beide Uhrzeiten angeben' });
      if (!p.arrive && !p.leave) continue;
      rows.push([p.member_id, p.place_id, p.arrive ? 1 : 0, p.leave ? 1 : 0, p.weekdays_only ? 1 : 0, from, to]);
    }
    db.exec('BEGIN');
    try {
      db.prepare('DELETE FROM place_prefs WHERE family_id = ? AND user_id = ?').run(req.familyId, req.user.id);
      const insert = db.prepare(
        'INSERT INTO place_prefs (family_id, user_id, member_id, place_id, arrive, leave, weekdays_only, from_time, to_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
      );
      for (const r of rows) insert.run(req.familyId, req.user.id, ...r);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
    res.status(204).end();
  });

  // Meldung vom Handy: { place_id, transition: 'enter' | 'exit', initial? }
  // initial = direkt nach dem Anmelden der Orte (man war schon da) → nur merken, nicht benachrichtigen
  router.post(`${base}/events`, auth, member, (req, res) => {
    const place = find(req, req.body?.place_id);
    const transition = req.body?.transition;
    if (!place || !['enter', 'exit'].includes(transition)) return res.status(400).json({ error: 'Ungültige Meldung' });
    const sharing = db.prepare('SELECT share_places FROM memberships WHERE family_id = ? AND user_id = ?').get(req.familyId, req.user.id).share_places;
    if (!sharing) return res.status(409).json({ error: 'Teilen ist ausgeschaltet' });

    const now = new Date();
    const enter = transition === 'enter';
    const initial = Boolean(req.body?.initial);
    const before = db.prepare('SELECT * FROM place_presence WHERE user_id = ? AND place_id = ?').get(req.user.id, place.id);
    let sent = [];

    if (!enter && before?.inside && !initial) {
      // Verlassen nur vormerken – bestätigt wird es erst nach EXIT_CONFIRM_MINUTES (checkPendingExits)
      if (!before.pending_exit_at) {
        db.prepare('UPDATE place_presence SET pending_exit_at = ? WHERE user_id = ? AND place_id = ?').run(sqlNow(now), req.user.id, place.id);
      }
      return res.json({ notified: 0, pending: true });
    }
    if (enter && before?.pending_exit_at) {
      // war gar nicht weg (GPS-Sprung): Vormerkung verwerfen, nichts melden
      db.prepare('UPDATE place_presence SET pending_exit_at = NULL WHERE user_id = ? AND place_id = ?').run(req.user.id, place.id);
      return res.json({ notified: 0 });
    }

    const lastNotified = enter ? before?.notified_enter_at : before?.notified_exit_at;
    // doppelte Meldung (schon drin/draußen) oder dieselbe Meldung vor kurzem → nichts schicken
    const duplicate = before && Boolean(before.inside) === enter;
    const tooSoon = lastNotified && minutesSince(lastNotified, now) < REPEAT_MINUTES;
    const notify = !initial && !duplicate && !tooSoon;

    db.prepare(
      `INSERT INTO place_presence (user_id, place_id, inside, changed_at, notified_enter_at, notified_exit_at) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (user_id, place_id) DO UPDATE SET inside = excluded.inside, pending_exit_at = NULL,
         changed_at = CASE WHEN place_presence.inside = excluded.inside THEN place_presence.changed_at ELSE excluded.changed_at END,
         notified_enter_at = COALESCE(excluded.notified_enter_at, place_presence.notified_enter_at),
         notified_exit_at = COALESCE(excluded.notified_exit_at, place_presence.notified_exit_at)`
    ).run(req.user.id, place.id, enter ? 1 : 0, sqlNow(now), notify && enter ? sqlNow(now) : null, notify && !enter ? sqlNow(now) : null);
    publish(req.familyId, 'places');

    if (notify) sent = notifyTransition(db, push, { familyId: req.familyId, userId: req.user.id, place, enter, at: now, now });
    res.json({ notified: sent.length });
  });

  // jede Minute vorgemerkte „Verlassen“ bestätigen
  setInterval(() => {
    try {
      checkPendingExits(db, { push, publish });
    } catch (err) {
      console.error('Orte:', err.message);
    }
  }, 60_000).unref();

  return router;
}

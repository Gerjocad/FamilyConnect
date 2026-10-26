// „📍 Wo bist du?“ – einmalige Standort-Abfrage mit Zustimmung.
// Wer fragt, löst eine Push-Nachricht aus; die gefragte Person entscheidet selbst: Standort senden, kurze
// Antwort („Bin bei Oma“) oder „Nicht jetzt“. Kein Live-Tracking: ein Standort, nur für den Fragenden
// sichtbar, nach 24 Stunden gelöscht.
import { Router } from 'express';

const KEEP_HOURS = 24;
// dieselbe Person frühestens nach so vielen Minuten erneut fragen (gegen Dauer-Nerven)
const ASK_AGAIN_MINUTES = 2;
const QUICK_MAX = 120;

/** Entfernung in Metern (Haversine) */
export function distance(a, b) {
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
}

/** Alte Abfragen löschen (Standorte sollen nicht herumliegen) */
export function cleanupLocateRequests(db) {
  db.prepare(`DELETE FROM locate_requests WHERE created_at < datetime('now', '-${KEEP_HOURS} hours')`).run();
}

export function locateRouter(db, { auth, member, publish, push }) {
  const router = Router();
  const base = '/api/families/:familyId/locate';
  const nameOf = (userId) => db.prepare('SELECT name FROM users WHERE id = ?').get(userId)?.name.split(' ')[0] ?? '';

  const serialize = (r) => {
    let place = null;
    if (r.lat !== null && r.lon !== null) {
      // liegt der Standort in einem der Orte der Familie? → „bei 🏫 Schule“
      const near = db.prepare('SELECT id, name, icon, lat, lon, radius FROM places WHERE family_id = ?').all(r.family_id)
        .map((p) => ({ ...p, d: distance(p, r) }))
        .filter((p) => p.d <= Math.max(p.radius, 100) + Math.min(r.accuracy ?? 0, 200))
        .sort((a, b) => a.d - b.d)[0];
      if (near) place = { id: near.id, name: near.name, icon: near.icon };
    }
    return {
      id: r.id, from_user: r.from_user, to_user: r.to_user, status: r.status, created_at: r.created_at, answered_at: r.answered_at,
      lat: r.lat, lon: r.lon, accuracy: r.accuracy, message: r.message, place,
    };
  };
  const find = (req) => db.prepare('SELECT * FROM locate_requests WHERE family_id = ? AND id = ?').get(req.familyId, Number(req.params.id));

  // Meine Abfragen (gestellt und an mich) der letzten 24 Stunden
  router.get(base, auth, member, (req, res) => {
    cleanupLocateRequests(db);
    res.json(db.prepare('SELECT * FROM locate_requests WHERE family_id = ? AND (from_user = ? OR to_user = ?) ORDER BY id DESC LIMIT 30')
      .all(req.familyId, req.user.id, req.user.id).map(serialize));
  });

  router.get(`${base}/:id`, auth, member, (req, res) => {
    const r = find(req);
    if (!r || (r.from_user !== req.user.id && r.to_user !== req.user.id)) return res.status(404).json({ error: 'Diese Abfrage gibt es nicht (mehr)' });
    res.json(serialize(r));
  });

  // Fragen
  router.post(base, auth, member, (req, res) => {
    const to = Number(req.body?.user_id);
    if (to === req.user.id) return res.status(400).json({ error: 'Dich selbst musst du nicht fragen 🙂' });
    if (!db.prepare('SELECT 1 FROM memberships WHERE family_id = ? AND user_id = ?').get(req.familyId, to)) return res.status(400).json({ error: 'Unbekannte Person' });
    const recent = db.prepare(
      `SELECT id FROM locate_requests WHERE family_id = ? AND from_user = ? AND to_user = ? AND created_at > datetime('now', '-${ASK_AGAIN_MINUTES} minutes')`
    ).get(req.familyId, req.user.id, to);
    if (recent) return res.status(429).json({ error: 'Gerade erst gefragt – bitte kurz warten' });
    const { lastInsertRowid } = db.prepare('INSERT INTO locate_requests (family_id, from_user, to_user) VALUES (?, ?, ?)')
      .run(req.familyId, req.user.id, to);
    push?.notify?.([to], { title: `📍 ${nameOf(req.user.id)} fragt: Wo bist du?`, body: 'Antippen, um zu antworten', path: `/standort/${lastInsertRowid}` });
    publish(req.familyId, 'locate');
    res.status(201).json(serialize(db.prepare('SELECT * FROM locate_requests WHERE id = ?').get(lastInsertRowid)));
  });

  // Antworten: { lat, lon, accuracy } und/oder { message }, oder { declined: true }
  router.post(`${base}/:id/answer`, auth, member, (req, res) => {
    const r = find(req);
    if (!r || r.to_user !== req.user.id) return res.status(404).json({ error: 'Diese Abfrage gibt es nicht (mehr)' });
    const b = req.body ?? {};
    const message = typeof b.message === 'string' ? b.message.trim().slice(0, QUICK_MAX) : '';
    let lat = null;
    let lon = null;
    let accuracy = null;
    if (!b.declined && b.lat !== undefined) {
      lat = Number(b.lat);
      lon = Number(b.lon);
      accuracy = b.accuracy === undefined ? null : Math.round(Number(b.accuracy));
      if (!(Math.abs(lat) <= 90) || !(Math.abs(lon) <= 180) || (accuracy !== null && !(accuracy >= 0))) return res.status(400).json({ error: 'Ungültiger Standort' });
    }
    if (!b.declined && lat === null && !message) return res.status(400).json({ error: 'Standort oder kurze Antwort fehlt' });
    const status = b.declined ? 'declined' : 'answered';
    db.prepare("UPDATE locate_requests SET status = ?, lat = ?, lon = ?, accuracy = ?, message = ?, answered_at = datetime('now') WHERE id = ?")
      .run(status, lat, lon, accuracy, message || null, r.id);
    const answer = serialize(db.prepare('SELECT * FROM locate_requests WHERE id = ?').get(r.id));
    const who = nameOf(req.user.id);
    push?.notify?.([r.from_user], {
      title: status === 'declined' ? `📍 ${who}: gerade nicht` : `📍 ${who} hat geantwortet`,
      body: [answer.place ? `bei ${answer.place.icon} ${answer.place.name}` : lat !== null ? 'Standort gesendet' : '', message].filter(Boolean).join(' · ') || 'Nicht jetzt',
      path: `/standort/${r.id}`,
    });
    publish(req.familyId, 'locate');
    res.json(answer);
  });

  return router;
}

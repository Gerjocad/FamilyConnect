// Dienste mit Rotation (Müll rausbringen, Spülmaschine …): wer an einem Termin dran ist, ergibt sich
// aus Startdatum, Abstand und Reihenfolge der Personen (client/src/chores.ts). Hier liegen nur die
// Ausnahmen pro Termin: getauscht und erledigt.
import { Router } from 'express';
import { isValidDate } from './crud.js';
import { isManager } from './permissions.js';
import { awardPoints, revokePoints } from './points.js';

/** Index des Termins (0, 1, 2 …) oder -1, wenn `date` kein Termin des Dienstes ist */
export function occurrenceIndex(chore, date) {
  // Feste Termine (Abfallkalender): Position in der Liste
  const fixed = typeof chore.dates === 'string' ? JSON.parse(chore.dates) : chore.dates ?? [];
  if (fixed.length) return fixed.indexOf(date);
  const start = Date.parse(`${chore.start_date}T00:00:00Z`);
  const day = Date.parse(`${date}T00:00:00Z`);
  const diff = Math.round((day - start) / 86_400_000);
  const step = chore.interval_weeks * 7;
  return diff >= 0 && diff % step === 0 ? diff / step : -1;
}

export function choresRouter(db, { auth, member, publish }) {
  const router = Router();
  const base = '/api/families/:familyId/chores/:choreId/days/:date';

  const load = (req, res) => {
    const chore = db.prepare('SELECT * FROM chores WHERE family_id = ? AND id = ?').get(req.familyId, Number(req.params.choreId));
    const { date } = req.params;
    if (!chore) return res.status(404).json({ error: 'Nicht gefunden' }), null;
    const index = isValidDate(date) ? occurrenceIndex(chore, date) : -1;
    if (index < 0) return res.status(400).json({ error: 'An diesem Tag ist dieser Dienst nicht dran' }), null;
    const members = JSON.parse(chore.member_ids);
    const day = db.prepare('SELECT * FROM chore_days WHERE chore_id = ? AND date = ?').get(chore.id, date);
    const assignee = day?.assignee_id ?? (members.length ? members[index % members.length] : null);
    return { chore, date, assignee };
  };

  const upsert = (choreId, date, fields) => {
    db.prepare('INSERT OR IGNORE INTO chore_days (chore_id, family_id, date) SELECT id, family_id, ? FROM chores WHERE id = ?').run(date, choreId);
    const sets = Object.keys(fields).map((k) => `${k} = ?`).join(', ');
    db.prepare(`UPDATE chore_days SET ${sets} WHERE chore_id = ? AND date = ?`).run(...Object.values(fields), choreId, date);
  };

  router.get('/api/families/:familyId/chore-days', auth, member, (req, res) => {
    const since = typeof req.query.since === 'string' && isValidDate(req.query.since) ? req.query.since : '0000-00-00';
    res.json(db.prepare('SELECT chore_id, date, assignee_id, done_by, done_at FROM chore_days WHERE family_id = ? AND date >= ? ORDER BY date')
      .all(req.familyId, since));
  });

  // Erledigt: wer dran ist, sowie Eltern und Admins
  router.post(`${base}/done`, auth, member, (req, res) => {
    const found = load(req, res);
    if (!found) return;
    if (found.assignee && found.assignee !== req.user.id && !isManager(req.role)) {
      return res.status(403).json({ error: 'Abhaken kann nur, wer dran ist' });
    }
    upsert(found.chore.id, found.date, { done_by: req.user.id, done_at: new Date().toISOString() });
    // Punkte bekommt, wer dran war (auch wenn Eltern für ein Kind abhaken)
    awardPoints(db, { familyId: req.familyId, userId: found.assignee ?? req.user.id, source: 'chore', ref: `chore:${found.chore.id}:${found.date}`, reason: `Dienst: ${found.chore.title}`, publish });
    publish(req.familyId, 'chores');
    res.status(204).end();
  });

  router.delete(`${base}/done`, auth, member, (req, res) => {
    const found = load(req, res);
    if (!found) return;
    if (found.assignee && found.assignee !== req.user.id && !isManager(req.role)) return res.status(403).json({ error: 'Keine Berechtigung' });
    upsert(found.chore.id, found.date, { done_by: null, done_at: null });
    revokePoints(db, { familyId: req.familyId, ref: `chore:${found.chore.id}:${found.date}`, publish });
    publish(req.familyId, 'chores');
    res.status(204).end();
  });

  // Tauschen: wer dran ist, gibt den Termin ab – Eltern und Admins dürfen jeden Termin umverteilen
  router.post(`${base}/assign`, auth, member, (req, res) => {
    const found = load(req, res);
    if (!found) return;
    if (found.assignee !== req.user.id && !isManager(req.role)) return res.status(403).json({ error: 'Tauschen kann nur, wer dran ist, oder die Eltern' });
    const userId = req.body?.user_id;
    const isMember = Number.isInteger(userId) &&
      db.prepare('SELECT 1 FROM memberships WHERE family_id = ? AND user_id = ?').get(req.familyId, userId);
    if (!isMember) return res.status(400).json({ error: 'Bitte ein Familienmitglied wählen' });
    upsert(found.chore.id, found.date, { assignee_id: userId });
    publish(req.familyId, 'chores');
    res.status(204).end();
  });

  return router;
}

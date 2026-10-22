// „Neuigkeiten“ oben in der App: was andere in letzter Zeit geschrieben haben, mit Ziel zum Hinspringen.
// Gelesen-Stand je Person und Familie (memberships.activity_seen_at).
import { Router } from 'express';

const DAYS = 30;
const LIMIT = 50;

/** Neu markierte Personen eines Termins (ohne den, der ihn einträgt); Kalender-Importe zählen nicht */
export function newlyTagged({ action, path, row, before, user }) {
  if (path !== 'events' || (action !== 'create' && action !== 'update')) return [];
  const had = new Set(before?.member_ids ?? []);
  return row.member_ids.filter((id) => id !== user.id && !had.has(id));
}

export const eventPath = (event) => `/kalender?tag=${event.start.slice(0, 10)}&termin=${event.id}`;

/** Markierungen merken, damit sie in der Glocke auftauchen */
export function recordMentions(db, change) {
  const ids = newlyTagged(change);
  const insert = db.prepare('INSERT INTO event_mentions (family_id, event_id, user_id, by_user_id) VALUES (?, ?, ?, ?)');
  for (const id of ids) insert.run(change.familyId, change.row.id, id, change.user.id);
}

export function activityRouter(db, { auth, member }) {
  const router = Router();
  const base = '/api/families/:familyId/activity';

  const itemsFor = (familyId, userId) => {
    const since = `datetime('now', '-${DAYS} days')`;
    const rows = [
      ...db.prepare(
        `SELECT 'comment' AS kind, c.id, c.created_at AS at, c.user_id, e.title AS subject, c.text,
                '/kalender?tag=' || c.date || '&termin=' || e.id AS path
         FROM event_comments c JOIN events e ON e.id = c.event_id
         WHERE c.family_id = ? AND c.user_id != ? AND c.created_at >= ${since}`
      ).all(familyId, userId),
      ...db.prepare(
        `SELECT 'event' AS kind, m.id, m.created_at AS at, m.by_user_id AS user_id, e.title AS subject, e.start AS text,
                '/kalender?tag=' || substr(e.start, 1, 10) || '&termin=' || e.id AS path
         FROM event_mentions m JOIN events e ON e.id = m.event_id
         WHERE m.family_id = ? AND m.user_id = ? AND m.created_at >= ${since}`
      ).all(familyId, userId),
      ...db.prepare(
        `SELECT 'post' AS kind, id, created_at AS at, created_by AS user_id, '' AS subject, text, '/pinnwand' AS path
         FROM posts WHERE family_id = ? AND created_by != ? AND created_at >= ${since}`
      ).all(familyId, userId),
      // Kommentare zu meinen Beiträgen oder zu Beiträgen, die ich kommentiert habe
      ...db.prepare(
        `SELECT 'post-comment' AS kind, c.id, c.created_at AS at, c.user_id, p.text AS subject, c.text, '/pinnwand' AS path
         FROM post_comments c JOIN posts p ON p.id = c.post_id
         WHERE c.family_id = ? AND c.user_id != ? AND c.created_at >= ${since}
           AND (p.created_by = ? OR EXISTS (SELECT 1 FROM post_comments o WHERE o.post_id = p.id AND o.user_id = ?))`
      ).all(familyId, userId, userId, userId),
      // Reaktionen auf meine Beiträge
      ...db.prepare(
        `SELECT 'post-reaction' AS kind, p.id * 100000 + r.user_id AS id, r.created_at AS at, r.user_id, p.text AS subject, r.emoji AS text, '/pinnwand' AS path
         FROM post_reactions r JOIN posts p ON p.id = r.post_id
         WHERE p.family_id = ? AND p.created_by = ? AND r.user_id != ? AND r.created_at >= ${since}`
      ).all(familyId, userId, userId),
      ...db.prepare(
        `SELECT 'complaint' AS kind, id, created_at AS at, created_by AS user_id, '' AS subject, text, '/beschwerden' AS path
         FROM complaints WHERE family_id = ? AND recipient_id = ? AND created_by != ? AND created_at >= ${since}`
      ).all(familyId, userId, userId),
      ...db.prepare(
        `SELECT 'complaint-comment' AS kind, cc.id, cc.created_at AS at, cc.user_id, c.text AS subject, cc.text, '/beschwerden' AS path
         FROM complaint_comments cc JOIN complaints c ON c.id = cc.complaint_id
         WHERE cc.family_id = ? AND cc.user_id != ? AND (c.created_by = ? OR c.recipient_id = ?) AND cc.created_at >= ${since}`
      ).all(familyId, userId, userId, userId),
      ...db.prepare(
        `SELECT 'complaint-resolved' AS kind, id, resolved_at AS at, resolved_by AS user_id, text AS subject, reply AS text, '/beschwerden' AS path
         FROM complaints WHERE family_id = ? AND created_by = ? AND resolved_by != ? AND resolved_at >= ${since}`
      ).all(familyId, userId, userId),
      ...db.prepare(
        `SELECT 'request' AS kind, id, created_at AS at, created_by AS user_id, title AS subject, details AS text, '/anfragen' AS path
         FROM requests WHERE family_id = ? AND recipient_id = ? AND created_by != ? AND created_at >= ${since}`
      ).all(familyId, userId, userId),
      ...db.prepare(
        `SELECT 'request-answer' AS kind, id, responded_at AS at, recipient_id AS user_id, title AS subject,
                status || '|' || response_note AS text, '/anfragen' AS path
         FROM requests WHERE family_id = ? AND created_by = ? AND recipient_id != ? AND responded_at >= ${since}`
      ).all(familyId, userId, userId),
    ];
    return rows.sort((a, b) => b.at.localeCompare(a.at) || b.id - a.id).slice(0, LIMIT)
      .map((r) => ({ ...r, key: `${r.kind}:${r.id}` }));
  };

  router.get(base, auth, member, (req, res) => {
    const seen = db.prepare('SELECT activity_seen_at FROM memberships WHERE family_id = ? AND user_id = ?')
      .get(req.familyId, req.user.id).activity_seen_at;
    res.json({ seen_at: seen, items: itemsFor(req.familyId, req.user.id) });
  });

  // Alles bis jetzt als gelesen markieren (beim Öffnen der Liste)
  router.post(`${base}/seen`, auth, member, (req, res) => {
    db.prepare("UPDATE memberships SET activity_seen_at = datetime('now') WHERE family_id = ? AND user_id = ?").run(req.familyId, req.user.id);
    res.status(204).end();
  });

  return router;
}

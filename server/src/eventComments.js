// Kommentare an Kalender-Terminen („Bringt jemand Getränke mit?“). Bei Serien hängt ein Kommentar
// an einem Tag (date), sonst am Beginn des Termins.
import { Router } from 'express';
import { isValidDate } from './crud.js';
import { isManager } from './permissions.js';

const COLUMNS = 'id, event_id, date, moved_from, user_id, text, created_at';
const DAY = 86_400_000;
const utc = (key) => { const [y, m, d] = key.split('-').map(Number); return Date.UTC(y, m - 1, d); };
const shiftKey = (key, days) => new Date(utc(key) + days * DAY).toISOString().slice(0, 10);

/**
 * Kommentare auf einen anderen Tag umhängen. Der ursprüngliche Tag bleibt in moved_from stehen,
 * damit die App die Unterhaltung als „Alter Chat“ zeigen kann (zurückverschoben → wieder normal).
 */
function moveComment(db, comment, eventId, date) {
  const origin = comment.moved_from ?? comment.date;
  db.prepare('UPDATE event_comments SET event_id = ?, date = ?, moved_from = ? WHERE id = ?')
    .run(eventId, date, origin === date ? null : origin, comment.id);
}

/** Nach dem Verschieben eines Termins wandern seine Kommentare mit (crud onChange) */
export function followEventDate(db, { action, path, row, before, familyId }, publish) {
  if (path !== 'events' || action !== 'update' || !before) return;
  const from = before.start.slice(0, 10);
  const to = row.start.slice(0, 10);
  if (from === to) return;
  const comments = db.prepare('SELECT * FROM event_comments WHERE event_id = ?').all(row.id);
  if (comments.length === 0) return;
  // Einzeltermin: alles hängt am (neuen) Tag; Serie: jeder Tag rückt um gleich viele Tage mit
  const days = Math.round((utc(to) - utc(from)) / DAY);
  for (const c of comments) moveComment(db, c, row.id, row.recurrence === 'none' ? to : shiftKey(c.date, days));
  publish(familyId, 'event-comments');
}

export function eventCommentsRouter(db, { auth, member, publish, push }) {
  const router = Router();
  const base = '/api/families/:familyId';

  router.get(`${base}/event-comments`, auth, member, (req, res) => {
    res.json(db.prepare(
      `SELECT ${COLUMNS} FROM event_comments WHERE family_id = ? ORDER BY created_at, id`
    ).all(req.familyId));
  });

  router.post(`${base}/events/:eventId/comments`, auth, member, (req, res) => {
    const event = db.prepare('SELECT * FROM events WHERE family_id = ? AND id = ?').get(req.familyId, Number(req.params.eventId));
    if (!event) return res.status(404).json({ error: 'Termin nicht gefunden' });
    const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
    if (!text) return res.status(400).json({ error: 'Bitte einen Kommentar schreiben' });
    if (text.length > 1000) return res.status(400).json({ error: 'Der Kommentar ist zu lang' });
    const date = req.body?.date ?? event.start.slice(0, 10);
    if (!isValidDate(date)) return res.status(400).json({ error: 'Ungültiges Datum' });
    const { lastInsertRowid } = db.prepare(
      'INSERT INTO event_comments (family_id, event_id, date, user_id, text) VALUES (?, ?, ?, ?, ?)'
    ).run(req.familyId, event.id, date, req.user.id, text);
    publish(req.familyId, 'event-comments');
    // Beteiligte (oder alle) und wer den Termin angelegt hat – ohne den Schreiber selbst
    const memberIds = JSON.parse(event.member_ids);
    const targets = memberIds.length
      ? [...memberIds, event.created_by]
      : db.prepare('SELECT user_id FROM memberships WHERE family_id = ?').all(req.familyId).map((m) => m.user_id);
    push?.notify([...new Set(targets)].filter((id) => id && id !== req.user.id), {
      title: `${req.user.name.split(' ')[0]} zu „${event.title}“`,
      body: text.length > 140 ? `${text.slice(0, 139)}…` : text,
      path: '/kalender',
    });
    res.status(201).json(db.prepare(`SELECT ${COLUMNS} FROM event_comments WHERE id = ?`).get(lastInsertRowid));
  });

  // Einzelnen Tag einer Serie geändert → daraus wurde ein eigener Termin; die Kommentare dieses Tages ziehen mit um
  // { to_event, from_date, to_date }
  router.post(`${base}/events/:eventId/comments/move`, auth, member, (req, res) => {
    const find = (id) => db.prepare('SELECT * FROM events WHERE family_id = ? AND id = ?').get(req.familyId, Number(id));
    const source = find(req.params.eventId);
    const target = find(req.body?.to_event);
    if (!source || !target) return res.status(404).json({ error: 'Termin nicht gefunden' });
    if (target.created_by !== req.user.id && !isManager(req.role)) return res.status(403).json({ error: 'Nur eigene Termine' });
    const { from_date: fromDate, to_date: toDate } = req.body;
    if (!isValidDate(fromDate) || !isValidDate(toDate)) return res.status(400).json({ error: 'Ungültiges Datum' });
    const comments = db.prepare('SELECT * FROM event_comments WHERE event_id = ? AND date = ?').all(source.id, fromDate);
    for (const c of comments) moveComment(db, c, target.id, toDate);
    if (comments.length) publish(req.familyId, 'event-comments');
    res.json({ moved: comments.length });
  });

  // Eigene Kommentare löschen; Eltern und Admins dürfen alle löschen
  router.delete(`${base}/event-comments/:id`, auth, member, (req, res) => {
    const row = db.prepare('SELECT * FROM event_comments WHERE family_id = ? AND id = ?').get(req.familyId, Number(req.params.id));
    if (!row) return res.status(404).json({ error: 'Nicht gefunden' });
    if (row.user_id !== req.user.id && !isManager(req.role)) return res.status(403).json({ error: 'Nur eigene Kommentare löschen' });
    db.prepare('DELETE FROM event_comments WHERE id = ?').run(row.id);
    publish(req.familyId, 'event-comments');
    res.status(204).end();
  });

  return router;
}

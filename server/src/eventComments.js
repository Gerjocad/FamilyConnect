// Kommentare an Kalender-Terminen („Bringt jemand Getränke mit?“). Bei Serien hängt ein Kommentar
// an einem Tag (date), sonst am Beginn des Termins.
import { Router } from 'express';
import { isValidDate } from './crud.js';
import { isManager } from './permissions.js';

export function eventCommentsRouter(db, { auth, member, publish, push }) {
  const router = Router();
  const base = '/api/families/:familyId';

  router.get(`${base}/event-comments`, auth, member, (req, res) => {
    res.json(db.prepare(
      'SELECT id, event_id, date, user_id, text, created_at FROM event_comments WHERE family_id = ? ORDER BY created_at, id'
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
    res.status(201).json(db.prepare('SELECT id, event_id, date, user_id, text, created_at FROM event_comments WHERE id = ?').get(lastInsertRowid));
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

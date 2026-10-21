// Beschwerden: Foto + kurzer Text an eine bestimmte Person. Sehen können sie nur Absender,
// Empfänger und Eltern/Admins; der Empfänger antwortet und erledigt sie.
import express, { Router } from 'express';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { isManager } from './permissions.js';
import { FILE_RE, removeImages, saveImages } from './uploads.js';

const MAX_IMAGES = 3;
const STATUSES = ['open', 'resolved'];

export function complaintsRouter(db, { auth, member, publish, uploadDir, push }) {
  const router = Router();
  mkdirSync(uploadDir, { recursive: true });

  const commentsOf = db.prepare('SELECT id, user_id, text, created_at FROM complaint_comments WHERE complaint_id = ? ORDER BY created_at, id');
  const serialize = (row) => ({ ...row, family_id: undefined, images: JSON.parse(row.images), comments: commentsOf.all(row.id) });
  const find = (req) => db.prepare('SELECT * FROM complaints WHERE family_id = ? AND id = ?').get(req.familyId, Number(req.params.id));
  const canSee = (req, row) => isManager(req.role) || row.created_by === req.user.id || row.recipient_id === req.user.id;
  const isMember = (familyId, userId) =>
    Number.isInteger(userId) && Boolean(db.prepare('SELECT 1 FROM memberships WHERE family_id = ? AND user_id = ?').get(familyId, userId));

  router.get('/api/families/:familyId/complaints', auth, member, (req, res) => {
    const rows = db.prepare(
      `SELECT * FROM complaints WHERE family_id = ? AND (? OR created_by = ? OR recipient_id = ?)
       ORDER BY status = 'resolved', created_at DESC, id DESC`
    ).all(req.familyId, isManager(req.role) ? 1 : 0, req.user.id, req.user.id);
    res.json(rows.map(serialize));
  });

  router.post('/api/families/:familyId/complaints', express.json({ limit: '20mb' }), auth, member, (req, res) => {
    const text = typeof req.body?.text === 'string' ? req.body.text.trim().slice(0, 1000) : '';
    const recipientId = req.body?.recipient_id;
    const images = Array.isArray(req.body?.images) ? req.body.images : [];
    if (!text) return res.status(400).json({ error: 'Bitte schreib kurz, worum es geht' });
    if (!isMember(req.familyId, recipientId)) return res.status(400).json({ error: 'Bitte wähle aus, an wen die Beschwerde geht' });
    if (recipientId === req.user.id) return res.status(400).json({ error: 'Über dich selbst kannst du dich nicht beschweren' });
    if (images.length === 0) return res.status(400).json({ error: 'Bitte füge ein Foto hinzu' });
    if (images.length > MAX_IMAGES) return res.status(400).json({ error: `Höchstens ${MAX_IMAGES} Fotos` });

    let saved;
    try {
      saved = saveImages(uploadDir, images);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
    const { lastInsertRowid } = db.prepare(
      'INSERT INTO complaints (family_id, created_by, recipient_id, text, images) VALUES (?, ?, ?, ?, ?)'
    ).run(req.familyId, req.user.id, recipientId, text, JSON.stringify(saved));
    publish(req.familyId, 'complaints');
    push?.notifyComplaint({ recipientId, from: req.user.name, text });
    res.status(201).json(serialize(db.prepare('SELECT * FROM complaints WHERE id = ?').get(lastInsertRowid)));
  });

  // Antworten / erledigen: Empfänger sowie Eltern und Admins
  router.patch('/api/families/:familyId/complaints/:id', auth, member, (req, res) => {
    const row = find(req);
    if (!row || !canSee(req, row)) return res.status(404).json({ error: 'Nicht gefunden' });
    if (row.recipient_id !== req.user.id && !isManager(req.role)) return res.status(403).json({ error: 'Antworten kann nur, an wen die Beschwerde geht' });
    const status = req.body?.status ?? row.status;
    const reply = req.body?.reply === undefined ? row.reply : typeof req.body.reply === 'string' ? req.body.reply.trim().slice(0, 1000) : null;
    if (!STATUSES.includes(status) || reply === null) return res.status(400).json({ error: 'Ungültige Angaben' });
    db.prepare(
      `UPDATE complaints SET status = ?, reply = ?, resolved_by = ?, resolved_at = CASE WHEN ? = 'resolved' THEN datetime('now') END WHERE id = ?`
    ).run(status, reply, status === 'resolved' ? req.user.id : null, status, row.id);
    publish(req.familyId, 'complaints');
    if (status === 'resolved' && row.status !== 'resolved' && row.created_by !== req.user.id) {
      push?.notifyComplaintResolved({ creatorId: row.created_by, by: req.user.name, reply });
    }
    res.json(serialize(find(req)));
  });

  // Zurückziehen: wer sie geschrieben hat, sowie Eltern und Admins
  router.delete('/api/families/:familyId/complaints/:id', auth, member, (req, res) => {
    const row = find(req);
    if (!row || !canSee(req, row)) return res.status(404).json({ error: 'Nicht gefunden' });
    if (row.created_by !== req.user.id && !isManager(req.role)) return res.status(403).json({ error: 'Keine Berechtigung' });
    db.prepare('DELETE FROM complaints WHERE id = ?').run(row.id);
    removeImages(uploadDir, JSON.parse(row.images));
    publish(req.familyId, 'complaints');
    res.status(204).end();
  });

  // Kommentare: alle, die die Beschwerde sehen dürfen – auch nach dem Erledigen
  router.post('/api/families/:familyId/complaints/:id/comments', auth, member, (req, res) => {
    const row = find(req);
    if (!row || !canSee(req, row)) return res.status(404).json({ error: 'Nicht gefunden' });
    const text = typeof req.body?.text === 'string' ? req.body.text.trim().slice(0, 1000) : '';
    if (!text) return res.status(400).json({ error: 'Bitte schreib einen Kommentar' });
    db.prepare('INSERT INTO complaint_comments (family_id, complaint_id, user_id, text) VALUES (?, ?, ?, ?)').run(req.familyId, row.id, req.user.id, text);
    publish(req.familyId, 'complaints');
    // Beteiligte (Absender und Empfänger) außer dem Schreibenden
    const targets = [...new Set([row.created_by, row.recipient_id])].filter((id) => id && id !== req.user.id);
    push?.notify?.(targets, { title: `${req.user.name.split(' ')[0]} zu einer Beschwerde`, body: text, path: '/beschwerden' });
    res.status(201).json(serialize(find(req)));
  });

  router.delete('/api/families/:familyId/complaint-comments/:id', auth, member, (req, res) => {
    const comment = db.prepare('SELECT * FROM complaint_comments WHERE family_id = ? AND id = ?').get(req.familyId, Number(req.params.id));
    if (!comment) return res.status(404).json({ error: 'Nicht gefunden' });
    if (comment.user_id !== req.user.id && !isManager(req.role)) return res.status(403).json({ error: 'Nur eigene Kommentare' });
    db.prepare('DELETE FROM complaint_comments WHERE id = ?').run(comment.id);
    publish(req.familyId, 'complaints');
    res.status(204).end();
  });

  // Foto abrufen – nur wer die Beschwerde sehen darf (Token per ?token= für <img>)
  router.get('/api/families/:familyId/complaint-images/:name', auth, member, (req, res) => {
    const { name } = req.params;
    const row = FILE_RE.test(name) && db.prepare(
      'SELECT complaints.* FROM complaints, json_each(complaints.images) WHERE family_id = ? AND json_each.value = ?'
    ).get(req.familyId, name);
    if (!row || !canSee(req, row)) return res.status(404).json({ error: 'Nicht gefunden' });
    res.set('Cache-Control', 'private, max-age=86400');
    res.sendFile(join(uploadDir, name));
  });

  return router;
}

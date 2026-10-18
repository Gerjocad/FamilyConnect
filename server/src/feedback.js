// Feedback: Fehler melden und Änderungswünsche sammeln, mit Screenshots.
// Bilder liegen als Dateien im Upload-Ordner und sind nur für angemeldete Familienmitglieder abrufbar.
import express, { Router } from 'express';
import { randomBytes } from 'node:crypto';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { isManager } from './permissions.js';

const KINDS = ['bug', 'idea'];
const STATUSES = ['open', 'done'];
const MAX_IMAGES = 5;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const FILE_RE = /^[0-9a-f]{32}\.(jpg|png|webp)$/;

export function feedbackRouter(db, { auth, member, publish, uploadDir }) {
  const router = Router();
  mkdirSync(uploadDir, { recursive: true });

  const serialize = (row) => ({ ...row, family_id: undefined, images: JSON.parse(row.images) });
  const find = (req) => db.prepare('SELECT * FROM feedback WHERE family_id = ? AND id = ?').get(req.familyId, Number(req.params.id));

  /** data:image/…;base64,… → Dateiname im Upload-Ordner */
  function saveImage(dataUrl) {
    const match = typeof dataUrl === 'string' && /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
    if (!match) throw new Error('Nur JPEG-, PNG- oder WebP-Bilder sind erlaubt');
    const bytes = Buffer.from(match[2], 'base64');
    if (bytes.length > MAX_IMAGE_BYTES) throw new Error('Ein Bild ist zu groß (max. 5 MB)');
    const name = `${randomBytes(16).toString('hex')}.${TYPES[match[1]]}`;
    writeFileSync(join(uploadDir, name), bytes);
    return name;
  }

  const removeImages = (names) => {
    for (const name of names) if (FILE_RE.test(name)) rmSync(join(uploadDir, name), { force: true });
  };

  router.get('/api/families/:familyId/feedback', auth, member, (req, res) => {
    const rows = db.prepare('SELECT * FROM feedback WHERE family_id = ? ORDER BY status = \'done\', created_at DESC, id DESC').all(req.familyId);
    res.json(rows.map(serialize));
  });

  // Screenshots machen die Anfrage größer als das allgemeine Limit
  router.post('/api/families/:familyId/feedback', express.json({ limit: '30mb' }), auth, member, (req, res) => {
    const text = typeof req.body?.text === 'string' ? req.body.text.trim().slice(0, 5000) : '';
    const kind = KINDS.includes(req.body?.kind) ? req.body.kind : 'idea';
    const images = Array.isArray(req.body?.images) ? req.body.images : [];
    if (!text) return res.status(400).json({ error: 'Bitte beschreibe kurz, worum es geht' });
    if (images.length > MAX_IMAGES) return res.status(400).json({ error: `Höchstens ${MAX_IMAGES} Bilder` });

    const saved = [];
    try {
      for (const image of images) saved.push(saveImage(image));
    } catch (err) {
      removeImages(saved);
      return res.status(400).json({ error: err.message });
    }
    const { lastInsertRowid } = db.prepare('INSERT INTO feedback (family_id, created_by, kind, text, images) VALUES (?, ?, ?, ?, ?)')
      .run(req.familyId, req.user.id, kind, text, JSON.stringify(saved));
    publish(req.familyId, 'feedback');
    res.status(201).json(serialize(db.prepare('SELECT * FROM feedback WHERE id = ?').get(lastInsertRowid)));
  });

  // Status ändern (erledigt/offen): Eltern, Admins und die Person, die es gemeldet hat
  router.patch('/api/families/:familyId/feedback/:id', auth, member, (req, res) => {
    const row = find(req);
    if (!row) return res.status(404).json({ error: 'Nicht gefunden' });
    if (row.created_by !== req.user.id && !isManager(req.role)) return res.status(403).json({ error: 'Keine Berechtigung' });
    const status = req.body?.status;
    if (!STATUSES.includes(status)) return res.status(400).json({ error: 'Ungültiger Status' });
    db.prepare('UPDATE feedback SET status = ? WHERE id = ?').run(status, row.id);
    publish(req.familyId, 'feedback');
    res.json(serialize(find(req)));
  });

  router.delete('/api/families/:familyId/feedback/:id', auth, member, (req, res) => {
    const row = find(req);
    if (!row) return res.status(404).json({ error: 'Nicht gefunden' });
    if (row.created_by !== req.user.id && !isManager(req.role)) return res.status(403).json({ error: 'Keine Berechtigung' });
    db.prepare('DELETE FROM feedback WHERE id = ?').run(row.id);
    removeImages(JSON.parse(row.images));
    publish(req.familyId, 'feedback');
    res.status(204).end();
  });

  // Bild abrufen – nur, wenn es zu einem Feedback der eigenen Familie gehört (Token per ?token= für <img>)
  router.get('/api/families/:familyId/feedback-images/:name', auth, member, (req, res) => {
    const { name } = req.params;
    const owned = FILE_RE.test(name) && db.prepare("SELECT 1 FROM feedback, json_each(feedback.images) WHERE family_id = ? AND json_each.value = ?").get(req.familyId, name);
    if (!owned) return res.status(404).json({ error: 'Nicht gefunden' });
    res.set('Cache-Control', 'private, max-age=86400');
    res.sendFile(join(uploadDir, name));
  });

  return router;
}

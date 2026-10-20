// Wunschlisten: jeder pflegt seine Wünsche, die anderen markieren heimlich „ich besorge das“.
// Wer etwas besorgt, sieht der Wünschende nie – auch nicht über die Antwort der API.
import { Router } from 'express';
import { isManager } from './permissions.js';

const text = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

export function wishesRouter(db, { auth, member, publish }) {
  const router = Router();
  const base = '/api/families/:familyId/wishes';
  const isMemberOf = (familyId, userId) =>
    Number.isInteger(userId) && Boolean(db.prepare('SELECT 1 FROM memberships WHERE family_id = ? AND user_id = ?').get(familyId, userId));

  const serialize = (row, userId) => {
    const own = row.owner_id === userId;
    return {
      id: row.id,
      owner_id: row.owner_id,
      title: row.title,
      link: row.link,
      price: row.price,
      notes: row.notes,
      created_by: row.created_by,
      created_at: row.created_at,
      reserved_by: own ? null : row.reserved_by,
      reserved_at: own ? null : row.reserved_at,
    };
  };
  const find = (req) => db.prepare('SELECT * FROM wishes WHERE family_id = ? AND id = ?').get(req.familyId, Number(req.params.id));
  const canEdit = (req, row) => row.owner_id === req.user.id || row.created_by === req.user.id || isManager(req.role);

  /** Felder aus dem Formular; Fehlermeldung als String */
  const fields = (body) => {
    const title = text(body?.title, 200);
    if (!title) return 'Was wünschst du dir?';
    const link = text(body?.link, 1000);
    if (link && !/^https?:\/\/\S+$/i.test(link)) return 'Der Link muss mit http:// oder https:// beginnen';
    return { title, link, price: text(body?.price, 30), notes: text(body?.notes, 1000) };
  };

  router.get(base, auth, member, (req, res) => {
    const rows = db.prepare('SELECT * FROM wishes WHERE family_id = ? ORDER BY created_at, id').all(req.familyId);
    res.json(rows.map((r) => serialize(r, req.user.id)));
  });

  router.post(base, auth, member, (req, res) => {
    const ownerId = req.body?.owner_id ?? req.user.id;
    if (!isMemberOf(req.familyId, ownerId)) return res.status(400).json({ error: 'Für wen ist der Wunsch?' });
    if (ownerId !== req.user.id && !isManager(req.role)) return res.status(403).json({ error: 'Wünsche trägt jeder selbst ein' });
    const f = fields(req.body);
    if (typeof f === 'string') return res.status(400).json({ error: f });
    const { lastInsertRowid } = db.prepare(
      'INSERT INTO wishes (family_id, owner_id, title, link, price, notes, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(req.familyId, ownerId, f.title, f.link, f.price, f.notes, req.user.id);
    publish(req.familyId, 'wishes');
    res.status(201).json(serialize(db.prepare('SELECT * FROM wishes WHERE id = ?').get(lastInsertRowid), req.user.id));
  });

  router.patch(`${base}/:id`, auth, member, (req, res) => {
    const row = find(req);
    if (!row) return res.status(404).json({ error: 'Wunsch nicht gefunden' });
    if (!canEdit(req, row)) return res.status(403).json({ error: 'Das ist nicht dein Wunsch' });
    const f = fields({ ...row, ...req.body });
    if (typeof f === 'string') return res.status(400).json({ error: f });
    db.prepare('UPDATE wishes SET title = ?, link = ?, price = ?, notes = ? WHERE id = ?').run(f.title, f.link, f.price, f.notes, row.id);
    publish(req.familyId, 'wishes');
    res.json(serialize(find(req), req.user.id));
  });

  router.delete(`${base}/:id`, auth, member, (req, res) => {
    const row = find(req);
    if (!row) return res.status(404).json({ error: 'Wunsch nicht gefunden' });
    if (!canEdit(req, row)) return res.status(403).json({ error: 'Das ist nicht dein Wunsch' });
    db.prepare('DELETE FROM wishes WHERE id = ?').run(row.id);
    publish(req.familyId, 'wishes');
    res.status(204).end();
  });

  // „Ich besorge das“ – nie für die eigenen Wünsche
  router.post(`${base}/:id/reserve`, auth, member, (req, res) => {
    const row = find(req);
    if (!row) return res.status(404).json({ error: 'Wunsch nicht gefunden' });
    if (row.owner_id === req.user.id) return res.status(403).json({ error: 'Eigene Wünsche kannst du nicht besorgen' });
    if (row.reserved_by && row.reserved_by !== req.user.id) return res.status(409).json({ error: 'Das besorgt schon jemand anderes' });
    db.prepare("UPDATE wishes SET reserved_by = ?, reserved_at = datetime('now') WHERE id = ?").run(req.user.id, row.id);
    publish(req.familyId, 'wishes');
    res.json(serialize(find(req), req.user.id));
  });

  router.delete(`${base}/:id/reserve`, auth, member, (req, res) => {
    const row = find(req);
    if (!row) return res.status(404).json({ error: 'Wunsch nicht gefunden' });
    if (row.owner_id === req.user.id) return res.status(403).json({ error: 'Eigene Wünsche kannst du nicht besorgen' });
    if (row.reserved_by !== req.user.id && !isManager(req.role)) return res.status(403).json({ error: 'Das hat jemand anderes übernommen' });
    db.prepare('UPDATE wishes SET reserved_by = NULL, reserved_at = NULL WHERE id = ?').run(row.id);
    publish(req.familyId, 'wishes');
    res.json(serialize(find(req), req.user.id));
  });

  return router;
}

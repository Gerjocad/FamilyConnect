// Geburtstage der Familienmitglieder und Geschenkideen. Ideen für eine Person sieht diese Person nie.
import { Router } from 'express';
import { isValidDate } from './crud.js';
import { isManager } from './permissions.js';

export function birthdaysRouter(db, { auth, member, publish }) {
  const router = Router();
  const isMemberOf = (familyId, userId) =>
    Number.isInteger(userId) && Boolean(db.prepare('SELECT 1 FROM memberships WHERE family_id = ? AND user_id = ?').get(familyId, userId));

  // Geburtstag eines Mitglieds: selbst, oder Eltern/Admins für alle (z. B. für jüngere Kinder)
  router.put('/api/families/:familyId/members/:userId/birthday', auth, member, (req, res) => {
    const userId = Number(req.params.userId);
    if (!isMemberOf(req.familyId, userId)) return res.status(404).json({ error: 'Kein Mitglied dieser Familie' });
    if (userId !== req.user.id && !isManager(req.role)) return res.status(403).json({ error: 'Nur Eltern dürfen das für andere eintragen' });
    const birthday = req.body?.birthday || null;
    if (birthday !== null && (!isValidDate(birthday) || birthday > new Date().toISOString().slice(0, 10)))
      return res.status(400).json({ error: 'Ungültiges Datum' });
    db.prepare('UPDATE users SET birthday = ? WHERE id = ?').run(birthday, userId);
    // Der Geburtstag steht bei den Mitgliedern – alle Familien der Person aktualisieren
    for (const { family_id: familyId } of db.prepare('SELECT family_id FROM memberships WHERE user_id = ?').all(userId)) publish(familyId, 'family');
    res.status(204).end();
  });

  const serialize = (row) => ({ ...row, family_id: undefined, bought: Boolean(row.bought) });
  const find = (req) => db.prepare('SELECT * FROM gift_ideas WHERE family_id = ? AND id = ?').get(req.familyId, Number(req.params.id));

  router.get('/api/families/:familyId/gift-ideas', auth, member, (req, res) => {
    const rows = db.prepare(
      'SELECT * FROM gift_ideas WHERE family_id = ? AND (for_user_id IS NULL OR for_user_id != ?) ORDER BY bought, created_at, id'
    ).all(req.familyId, req.user.id);
    res.json(rows.map(serialize));
  });

  router.post('/api/families/:familyId/gift-ideas', auth, member, (req, res) => {
    const text = typeof req.body?.text === 'string' ? req.body.text.trim().slice(0, 300) : '';
    const forUser = req.body?.for_user_id ?? null;
    const forContact = req.body?.for_contact_id ?? null;
    if (!text) return res.status(400).json({ error: 'Bitte die Idee eintragen' });
    if ((forUser === null) === (forContact === null)) return res.status(400).json({ error: 'Für wen ist die Idee?' });
    if (forUser !== null && (!isMemberOf(req.familyId, forUser) || forUser === req.user.id))
      return res.status(400).json({ error: 'Ungültige Person' });
    if (forContact !== null && !db.prepare('SELECT 1 FROM contacts WHERE family_id = ? AND id = ?').get(req.familyId, forContact))
      return res.status(400).json({ error: 'Unbekannter Kontakt' });
    const { lastInsertRowid } = db.prepare(
      'INSERT INTO gift_ideas (family_id, for_user_id, for_contact_id, text, created_by) VALUES (?, ?, ?, ?, ?)'
    ).run(req.familyId, forUser, forContact, text, req.user.id);
    publish(req.familyId, 'gift-ideas');
    res.status(201).json(serialize(db.prepare('SELECT * FROM gift_ideas WHERE id = ?').get(lastInsertRowid)));
  });

  // Als gekauft markieren
  router.patch('/api/families/:familyId/gift-ideas/:id', auth, member, (req, res) => {
    const row = find(req);
    if (!row || row.for_user_id === req.user.id) return res.status(404).json({ error: 'Nicht gefunden' });
    if (typeof req.body?.bought !== 'boolean') return res.status(400).json({ error: 'Ungültige Angabe' });
    db.prepare('UPDATE gift_ideas SET bought = ? WHERE id = ?').run(req.body.bought ? 1 : 0, row.id);
    publish(req.familyId, 'gift-ideas');
    res.json(serialize(find(req)));
  });

  router.delete('/api/families/:familyId/gift-ideas/:id', auth, member, (req, res) => {
    const row = find(req);
    if (!row || row.for_user_id === req.user.id) return res.status(404).json({ error: 'Nicht gefunden' });
    db.prepare('DELETE FROM gift_ideas WHERE id = ?').run(row.id);
    publish(req.familyId, 'gift-ideas');
    res.status(204).end();
  });

  return router;
}

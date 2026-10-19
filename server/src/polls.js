// Abstimmungen auf der Pinnwand: ein Beitrag mit 2–6 Antworten, jede Person hat eine Stimme
import { Router } from 'express';

const MIN_OPTIONS = 2;
const MAX_OPTIONS = 6;

export function pollsRouter(db, { auth, member, publish, push }) {
  const router = Router();
  const base = '/api/families/:familyId/polls';

  const pollFor = (postId) => ({
    post_id: postId,
    options: db.prepare('SELECT id, text FROM poll_options WHERE post_id = ? ORDER BY position').all(postId),
    votes: db.prepare('SELECT option_id, user_id FROM poll_votes WHERE post_id = ?').all(postId),
  });

  router.get(base, auth, member, (req, res) => {
    const ids = db.prepare('SELECT DISTINCT o.post_id FROM poll_options o JOIN posts p ON p.id = o.post_id WHERE p.family_id = ?')
      .all(req.familyId).map((r) => r.post_id);
    res.json(ids.map(pollFor));
  });

  router.post(base, auth, member, (req, res) => {
    const text = typeof req.body?.text === 'string' ? req.body.text.trim().slice(0, 500) : '';
    const options = Array.isArray(req.body?.options)
      ? [...new Set(req.body.options.filter((o) => typeof o === 'string').map((o) => o.trim().slice(0, 100)).filter(Boolean))]
      : [];
    if (!text) return res.status(400).json({ error: 'Bitte stell eine Frage' });
    if (options.length < MIN_OPTIONS || options.length > MAX_OPTIONS)
      return res.status(400).json({ error: `Bitte ${MIN_OPTIONS} bis ${MAX_OPTIONS} verschiedene Antworten eingeben` });
    db.exec('BEGIN');
    let postId;
    try {
      postId = Number(db.prepare('INSERT INTO posts (family_id, created_by, text) VALUES (?, ?, ?)').run(req.familyId, req.user.id, text).lastInsertRowid);
      const insert = db.prepare('INSERT INTO poll_options (post_id, text, position) VALUES (?, ?, ?)');
      options.forEach((option, i) => insert.run(postId, option, i));
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
    publish(req.familyId, 'posts');
    const row = db.prepare('SELECT * FROM posts WHERE id = ?').get(postId);
    push?.handleChange({ action: 'create', path: 'posts', row: { ...row, text: `📊 ${text}` }, before: null, user: req.user, familyId: req.familyId });
    res.status(201).json(pollFor(postId));
  });

  // Abstimmen bzw. Stimme ändern; ohne option_id wird die Stimme zurückgenommen
  router.put(`${base}/:postId/vote`, auth, member, (req, res) => {
    const postId = Number(req.params.postId);
    const exists = db.prepare('SELECT 1 FROM poll_options o JOIN posts p ON p.id = o.post_id WHERE p.family_id = ? AND o.post_id = ?').get(req.familyId, postId);
    if (!exists) return res.status(404).json({ error: 'Abstimmung nicht gefunden' });
    const optionId = req.body?.option_id ?? null;
    if (optionId === null) {
      db.prepare('DELETE FROM poll_votes WHERE post_id = ? AND user_id = ?').run(postId, req.user.id);
    } else {
      if (!db.prepare('SELECT 1 FROM poll_options WHERE id = ? AND post_id = ?').get(optionId, postId))
        return res.status(400).json({ error: 'Ungültige Antwort' });
      db.prepare(
        `INSERT INTO poll_votes (post_id, option_id, user_id) VALUES (?, ?, ?)
         ON CONFLICT (post_id, user_id) DO UPDATE SET option_id = excluded.option_id`
      ).run(postId, optionId, req.user.id);
    }
    publish(req.familyId, 'polls');
    res.json(pollFor(postId));
  });

  return router;
}

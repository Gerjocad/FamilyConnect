// Pinnwand: Kommentare und Reaktionen (8 Smileys, eine Reaktion pro Person und Beitrag)
import { Router } from 'express';
import { isManager } from './permissions.js';

export const REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '😡', '🎉', '🙏'];

const short = (text) => (text.length > 140 ? `${text.slice(0, 139)}…` : text);

export function postExtrasRouter(db, { auth, member, publish, push }) {
  const router = Router();
  const base = '/api/families/:familyId';
  const findPost = (req) => db.prepare('SELECT * FROM posts WHERE family_id = ? AND id = ?').get(req.familyId, Number(req.params.postId));

  router.get(`${base}/post-extras`, auth, member, (req, res) => {
    res.json({
      comments: db.prepare('SELECT id, post_id, user_id, text, created_at FROM post_comments WHERE family_id = ? ORDER BY created_at, id').all(req.familyId),
      reactions: db.prepare(
        'SELECT r.post_id, r.user_id, r.emoji FROM post_reactions r JOIN posts p ON p.id = r.post_id WHERE p.family_id = ? ORDER BY r.created_at'
      ).all(req.familyId),
    });
  });

  router.post(`${base}/posts/:postId/comments`, auth, member, (req, res) => {
    const post = findPost(req);
    if (!post) return res.status(404).json({ error: 'Beitrag nicht gefunden' });
    const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
    if (!text) return res.status(400).json({ error: 'Bitte einen Kommentar schreiben' });
    if (text.length > 1000) return res.status(400).json({ error: 'Der Kommentar ist zu lang' });
    const { lastInsertRowid } = db.prepare('INSERT INTO post_comments (family_id, post_id, user_id, text) VALUES (?, ?, ?, ?)')
      .run(req.familyId, post.id, req.user.id, text);
    publish(req.familyId, 'post-extras');
    // wer den Beitrag geschrieben oder schon kommentiert hat – ohne den Schreiber selbst
    const targets = new Set([post.created_by, ...db.prepare('SELECT user_id FROM post_comments WHERE post_id = ?').all(post.id).map((r) => r.user_id)]);
    targets.delete(req.user.id);
    push?.notify?.([...targets].filter(Boolean), {
      title: `💬 ${req.user.name.split(' ')[0]} auf der Pinnwand`,
      body: short(text),
      path: '/pinnwand',
    });
    res.status(201).json(db.prepare('SELECT id, post_id, user_id, text, created_at FROM post_comments WHERE id = ?').get(lastInsertRowid));
  });

  router.delete(`${base}/post-comments/:id`, auth, member, (req, res) => {
    const row = db.prepare('SELECT * FROM post_comments WHERE family_id = ? AND id = ?').get(req.familyId, Number(req.params.id));
    if (!row) return res.status(404).json({ error: 'Nicht gefunden' });
    if (row.user_id !== req.user.id && !isManager(req.role)) return res.status(403).json({ error: 'Nur eigene Kommentare löschen' });
    db.prepare('DELETE FROM post_comments WHERE id = ?').run(row.id);
    publish(req.familyId, 'post-extras');
    res.status(204).end();
  });

  // Reaktion setzen, wechseln oder mit emoji: null zurücknehmen
  router.put(`${base}/posts/:postId/reaction`, auth, member, (req, res) => {
    const post = findPost(req);
    if (!post) return res.status(404).json({ error: 'Beitrag nicht gefunden' });
    const emoji = req.body?.emoji ?? null;
    if (emoji !== null && !REACTIONS.includes(emoji)) return res.status(400).json({ error: 'Unbekannte Reaktion' });
    const before = db.prepare('SELECT emoji FROM post_reactions WHERE post_id = ? AND user_id = ?').get(post.id, req.user.id);
    if (emoji === null) {
      db.prepare('DELETE FROM post_reactions WHERE post_id = ? AND user_id = ?').run(post.id, req.user.id);
    } else {
      db.prepare(
        `INSERT INTO post_reactions (post_id, user_id, emoji) VALUES (?, ?, ?)
         ON CONFLICT (post_id, user_id) DO UPDATE SET emoji = excluded.emoji, created_at = datetime('now')`
      ).run(post.id, req.user.id, emoji);
      // nur bei einer neuen Reaktion Bescheid geben, nicht beim Wechseln
      if (!before && post.created_by && post.created_by !== req.user.id) {
        push?.notify?.([post.created_by], { title: `${emoji} ${req.user.name.split(' ')[0]} hat reagiert`, body: short(post.text), path: '/pinnwand' });
      }
    }
    publish(req.familyId, 'post-extras');
    res.status(204).end();
  });

  return router;
}

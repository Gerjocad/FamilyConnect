// Abstimmungen auf der Pinnwand: ein Beitrag mit 2–6 Antworten, jede Person hat eine Stimme.
// Mit Ziel (poll_plans): „Was essen wir am Samstag?“ landet im Essensplan, „Wohin am Sonntag?“ als Termin im Kalender –
// sobald alle abgestimmt haben (und es einen klaren Sieger gibt) oder wer gefragt hat, die Umfrage beendet.
import { Router } from 'express';
import { isValidDate } from './crud.js';
import { formatEventDate } from './push.js';
import { isManager } from './permissions.js';

const MIN_OPTIONS = 2;
const MAX_OPTIONS = 6;
const SLOTS = ['breakfast', 'lunch', 'dinner'];
const SLOT_LABEL = { breakfast: 'Frühstück', lunch: 'Mittagessen', dinner: 'Abendessen' };
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Ziel einer Umfrage prüfen; null = normale Abstimmung */
function parsePlan(plan) {
  if (plan == null) return { plan: null };
  if (!['meal', 'trip'].includes(plan.kind)) return { error: 'Unbekannte Umfrage' };
  if (typeof plan.date !== 'string' || !isValidDate(plan.date)) return { error: 'Bitte einen Tag auswählen' };
  if (plan.kind === 'meal') {
    if (!SLOTS.includes(plan.slot)) return { error: 'Bitte die Mahlzeit auswählen' };
    return { plan: { kind: 'meal', date: plan.date, slot: plan.slot, start_time: null, end_time: null } };
  }
  const start = plan.start_time || null;
  const end = plan.end_time || null;
  if ((start && !TIME_RE.test(start)) || (end && !TIME_RE.test(end)) || (end && !start)) return { error: 'Ungültige Uhrzeit' };
  if (start && end && end <= start) return { error: 'Das Ende muss nach dem Beginn liegen' };
  return { plan: { kind: 'trip', date: plan.date, slot: null, start_time: start, end_time: end } };
}

/** Option mit den meisten Stimmen – nur wenn sie eindeutig vorne liegt */
function clearWinner(poll) {
  const counts = poll.options.map((o) => ({ o, n: poll.votes.filter((v) => v.option_id === o.id).length }));
  const best = Math.max(0, ...counts.map((c) => c.n));
  const top = counts.filter((c) => c.n === best);
  return best > 0 && top.length === 1 ? top[0].o : null;
}

export function pollsRouter(db, { auth, member, publish, push }) {
  const router = Router();
  const base = '/api/families/:familyId/polls';

  const pollFor = (postId) => ({
    post_id: postId,
    options: db.prepare('SELECT id, text FROM poll_options WHERE post_id = ? ORDER BY position').all(postId),
    votes: db.prepare('SELECT option_id, user_id FROM poll_votes WHERE post_id = ?').all(postId),
    plan: db.prepare('SELECT kind, date, slot, start_time, end_time, result_option_id, result_ref, closed_at FROM poll_plans WHERE post_id = ?').get(postId) ?? null,
  });

  // Ergebnis eintragen: Essensplan (vorhandene Mahlzeit wird ersetzt) bzw. ganztägiger/zeitlicher Termin für alle
  const close = (familyId, postId, option, user) => {
    const plan = db.prepare('SELECT * FROM poll_plans WHERE post_id = ?').get(postId);
    const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(postId);
    let ref;
    let body;
    let path;
    if (plan.kind === 'meal') {
      const recipe = db.prepare('SELECT id FROM recipes WHERE family_id = ? AND lower(title) = lower(?)').get(familyId, option.text);
      const existing = db.prepare('SELECT id FROM meals WHERE family_id = ? AND date = ? AND slot = ?').get(familyId, plan.date, plan.slot);
      if (existing) {
        db.prepare('UPDATE meals SET title = ?, recipe_id = ? WHERE id = ?').run(option.text, recipe?.id ?? null, existing.id);
        ref = existing.id;
      } else {
        ref = Number(db.prepare('INSERT INTO meals (family_id, date, slot, title, recipe_id, created_by) VALUES (?, ?, ?, ?, ?, ?)')
          .run(familyId, plan.date, plan.slot, option.text, recipe?.id ?? null, post.created_by).lastInsertRowid);
      }
      body = `${SLOT_LABEL[plan.slot]} am ${formatEventDate({ start: plan.date, all_day: true })} – steht im Essensplan`;
      path = '/essen';
      publish(familyId, 'meals');
    } else {
      const allDay = !plan.start_time;
      const start = `${plan.date}T${plan.start_time ?? '00:00'}`;
      const end = `${plan.date}T${allDay ? '23:59' : plan.end_time ?? addHours(plan.start_time, 2)}`;
      ref = Number(db.prepare('INSERT INTO events (family_id, title, start, end, all_day, description, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(familyId, option.text, start, end, allDay ? 1 : 0, `Per Umfrage entschieden: ${post.text}`, post.created_by).lastInsertRowid);
      body = `${formatEventDate({ start, all_day: allDay })} – steht im Kalender`;
      path = `/kalender?tag=${plan.date}&termin=${ref}`;
      publish(familyId, 'events');
    }
    db.prepare("UPDATE poll_plans SET result_option_id = ?, result_ref = ?, closed_at = datetime('now') WHERE post_id = ?").run(option.id, ref, postId);
    publish(familyId, 'polls');
    const everyone = db.prepare('SELECT user_id FROM memberships WHERE family_id = ?').all(familyId).map((m) => m.user_id);
    push?.notify?.(everyone.filter((id) => id !== user?.id), { title: `🗳️ Entschieden: ${option.text}`, body, path });
  };

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
    const { plan, error } = parsePlan(req.body?.plan);
    if (error) return res.status(400).json({ error });
    db.exec('BEGIN');
    let postId;
    try {
      postId = Number(db.prepare('INSERT INTO posts (family_id, created_by, text) VALUES (?, ?, ?)').run(req.familyId, req.user.id, text).lastInsertRowid);
      const insert = db.prepare('INSERT INTO poll_options (post_id, text, position) VALUES (?, ?, ?)');
      options.forEach((option, i) => insert.run(postId, option, i));
      if (plan) {
        db.prepare('INSERT INTO poll_plans (post_id, kind, date, slot, start_time, end_time) VALUES (?, ?, ?, ?, ?, ?)')
          .run(postId, plan.kind, plan.date, plan.slot, plan.start_time, plan.end_time);
      }
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
    if (db.prepare('SELECT 1 FROM poll_plans WHERE post_id = ? AND closed_at IS NOT NULL').get(postId))
      return res.status(409).json({ error: 'Die Umfrage ist schon entschieden' });
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
    // Alle haben abgestimmt und eine Antwort liegt vorne → gleich eintragen
    const poll = pollFor(postId);
    if (poll.plan) {
      const members = db.prepare('SELECT COUNT(*) AS n FROM memberships WHERE family_id = ?').get(req.familyId).n;
      const winner = clearWinner(poll);
      if (poll.votes.length >= members && winner) close(req.familyId, postId, winner, req.user);
    }
    res.json(pollFor(postId));
  });

  // Umfrage beenden (wer gefragt hat oder Eltern): { option_id } bei Gleichstand, sonst gewinnt die meistgewählte
  router.post(`${base}/:postId/close`, auth, member, (req, res) => {
    const postId = Number(req.params.postId);
    const post = db.prepare('SELECT * FROM posts WHERE family_id = ? AND id = ?').get(req.familyId, postId);
    const poll = post && pollFor(postId);
    if (!poll?.plan) return res.status(404).json({ error: 'Umfrage nicht gefunden' });
    if (poll.plan.closed_at) return res.status(409).json({ error: 'Die Umfrage ist schon entschieden' });
    if (post.created_by !== req.user.id && !isManager(req.role)) return res.status(403).json({ error: 'Beenden kann, wer gefragt hat, oder die Eltern' });
    const chosen = req.body?.option_id != null ? poll.options.find((o) => o.id === Number(req.body.option_id)) : clearWinner(poll);
    if (!chosen) {
      return res.status(409).json({ error: poll.votes.length ? 'Gleichstand – bitte eine Antwort auswählen' : 'Noch hat niemand abgestimmt' });
    }
    close(req.familyId, postId, chosen, req.user);
    res.json(pollFor(postId));
  });

  return router;
}

const addHours = (time, hours) => {
  const [h, m] = time.split(':').map(Number);
  return `${String(Math.min(h + hours, 23)).padStart(2, '0')}:${String(h + hours > 23 ? 59 : m).padStart(2, '0')}`;
};

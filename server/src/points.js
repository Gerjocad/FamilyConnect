// Punkte & Belohnungen.
// Wer Punkte sammelt (memberships.collects_points, Standard: Kinder), bekommt sie automatisch für erledigte
// Aufgaben, abgehakte Gewohnheiten und Dienste; Eltern können Bonus- oder Abzugspunkte mit Grund vergeben.
// Belohnungen legen die Eltern an; einlösen = Anfrage an die Eltern, die Punkte sind solange vorgemerkt.
// Alles läuft über ein Punktebuch (points_ledger) – der Kontostand ist die Summe, nichts wird überschrieben.
import { Router } from 'express';
import { isManager } from './permissions.js';

export const SOURCES = ['task', 'habit', 'chore', 'bonus', 'reward'];
export const DEFAULT_POINTS = { task: 5, habit: 2, chore: 5 };
const MAX_POINTS = 1000;

const settingsOf = (db, familyId) => {
  const f = db.prepare('SELECT points_enabled, points_released, points_task, points_habit, points_chore FROM families WHERE id = ?').get(familyId);
  return {
    enabled: Boolean(f?.points_enabled),
    released: Boolean(f?.points_released),
    task: f?.points_task ?? DEFAULT_POINTS.task,
    habit: f?.points_habit ?? DEFAULT_POINTS.habit,
    chore: f?.points_chore ?? DEFAULT_POINTS.chore,
  };
};

/** Sammelt diese Person Punkte? Nicht ausdrücklich eingestellt → Kinder ja, Erwachsene nein */
const collectsRow = (m) => (m.collects_points === null ? m.role === 'child' : Boolean(m.collects_points));
const collects = (db, familyId, userId) => {
  const m = db.prepare('SELECT role, collects_points FROM memberships WHERE family_id = ? AND user_id = ?').get(familyId, userId);
  return Boolean(m && collectsRow(m));
};

/**
 * Punkte automatisch gutschreiben (Aufgabe, Gewohnheit, Dienst). Jede Erledigung hat einen eindeutigen `ref`,
 * damit doppeltes Abhaken nichts doppelt zählt und Rückgängig genau diese Punkte wieder abzieht.
 */
export function awardPoints(db, { familyId, userId, source, ref, reason, publish }) {
  if (!userId) return false;
  const settings = settingsOf(db, familyId);
  if (!settings.enabled || !collects(db, familyId, userId)) return false;
  const amount = settings[source];
  if (!amount) return false;
  const { changes } = db.prepare(
    'INSERT OR IGNORE INTO points_ledger (family_id, user_id, amount, reason, source, ref) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(familyId, userId, amount, String(reason).slice(0, 200), source, ref);
  if (changes) publish?.(familyId, 'points');
  return changes > 0;
}

/** Erledigung zurückgenommen → die dafür gutgeschriebenen Punkte wieder abziehen */
export function revokePoints(db, { familyId, ref, publish }) {
  const { changes } = db.prepare('DELETE FROM points_ledger WHERE family_id = ? AND ref = ?').run(familyId, ref);
  if (changes) publish?.(familyId, 'points');
}

/** Aufgaben laufen über die allgemeine Ressourcen-Verwaltung: erledigt (oder wiederkehrend vorgerückt) → Punkte */
export function pointsForTaskChange(db, change, publish) {
  if (change.path !== 'tasks' || change.action !== 'update' || !change.before) return;
  const { row, before, familyId, user } = change;
  const who = row.assignee_id ?? user.id;
  const title = `Aufgabe: ${row.title}`;
  if (row.recurrence !== 'none') {
    // wiederkehrend: Abhaken setzt done nicht, sondern rückt das Fälligkeitsdatum vor
    if (row.due_date && before.due_date && row.due_date > before.due_date && !row.done) {
      awardPoints(db, { familyId, userId: who, source: 'task', ref: `task:${row.id}:${before.due_date}`, reason: title, publish });
    }
    return;
  }
  if (row.done && !before.done) awardPoints(db, { familyId, userId: who, source: 'task', ref: `task:${row.id}`, reason: title, publish });
  if (!row.done && before.done) revokePoints(db, { familyId, ref: `task:${row.id}`, publish });
}

const balanceOf = (db, familyId, userId) =>
  db.prepare('SELECT COALESCE(SUM(amount), 0) AS n FROM points_ledger WHERE family_id = ? AND user_id = ?').get(familyId, userId).n;
const reservedOf = (db, familyId, userId) =>
  db.prepare("SELECT COALESCE(SUM(cost), 0) AS n FROM reward_redemptions WHERE family_id = ? AND user_id = ? AND status = 'pending'").get(familyId, userId).n;

export function pointsRouter(db, { auth, member, publish, push }) {
  const router = Router();
  const base = '/api/families/:familyId/points';
  const managers = (req, res, next) => (isManager(req.role) ? next() : res.status(403).json({ error: 'Das machen die Eltern' }));
  const notifyManagers = (familyId, message) => {
    const ids = db.prepare("SELECT user_id FROM memberships WHERE family_id = ? AND role IN ('admin', 'parent')").all(familyId).map((r) => r.user_id);
    push?.notify?.(ids, { ...message, path: '/punkte' });
  };
  const nameOf = (userId) => db.prepare('SELECT name FROM users WHERE id = ?').get(userId)?.name.split(' ')[0] ?? '';
  const int = (v, min, max) => (Number.isInteger(v) && v >= min && v <= max ? v : null);

  // Alles für die Punkte-Seite: Einstellungen, Kontostände, Belohnungen, offene Einlösungen, letzte Buchungen
  router.get(base, auth, member, (req, res) => {
    const manager = isManager(req.role);
    const settings = settingsOf(db, req.familyId);
    const weekStart = (() => {
      const d = new Date();
      const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7));
      return monday.toISOString().slice(0, 19).replace('T', ' ');
    })();
    const people = db.prepare(
      `SELECT m.user_id, m.role, m.collects_points FROM memberships m WHERE m.family_id = ? ORDER BY m.joined_at, m.user_id`
    ).all(req.familyId).map((m) => ({
      user_id: m.user_id,
      collects: collectsRow(m),
      balance: balanceOf(db, req.familyId, m.user_id),
      reserved: reservedOf(db, req.familyId, m.user_id),
      week: db.prepare('SELECT COALESCE(SUM(amount), 0) AS n FROM points_ledger WHERE family_id = ? AND user_id = ? AND amount > 0 AND created_at >= ?')
        .get(req.familyId, m.user_id, weekStart).n,
    })).filter((p) => manager || p.user_id === req.user.id);
    const visibleUser = manager ? '' : ' AND user_id = ?';
    const args = manager ? [req.familyId] : [req.familyId, req.user.id];
    res.json({
      settings,
      people,
      rewards: db.prepare('SELECT id, title, emoji, cost FROM rewards WHERE family_id = ? AND active = 1 ORDER BY cost, title').all(req.familyId),
      redemptions: db.prepare(`SELECT * FROM reward_redemptions WHERE family_id = ?${visibleUser} ORDER BY status = 'pending' DESC, id DESC LIMIT 30`).all(...args),
      history: db.prepare(`SELECT id, user_id, amount, reason, source, created_by, created_at FROM points_ledger WHERE family_id = ?${visibleUser} ORDER BY id DESC LIMIT 60`).all(...args),
    });
  });

  // Einstellungen: an/aus, für alle freigeben, Punkte je Art, wer sammelt
  router.put(`${base}/settings`, auth, member, managers, (req, res) => {
    const b = req.body ?? {};
    const current = settingsOf(db, req.familyId);
    const next = {
      enabled: typeof b.enabled === 'boolean' ? b.enabled : current.enabled,
      released: typeof b.released === 'boolean' ? b.released : current.released,
      task: b.task === undefined ? current.task : int(b.task, 0, 100),
      habit: b.habit === undefined ? current.habit : int(b.habit, 0, 100),
      chore: b.chore === undefined ? current.chore : int(b.chore, 0, 100),
    };
    if ([next.task, next.habit, next.chore].includes(null)) return res.status(400).json({ error: 'Punkte je Art: 0 bis 100' });
    db.prepare('UPDATE families SET points_enabled = ?, points_released = ?, points_task = ?, points_habit = ?, points_chore = ? WHERE id = ?')
      .run(next.enabled ? 1 : 0, next.released ? 1 : 0, next.task, next.habit, next.chore, req.familyId);
    if (b.collectors !== undefined) {
      if (!Array.isArray(b.collectors)) return res.status(400).json({ error: 'collectors muss eine Liste sein' });
      db.prepare('UPDATE memberships SET collects_points = 0 WHERE family_id = ?').run(req.familyId);
      const set = db.prepare('UPDATE memberships SET collects_points = 1 WHERE family_id = ? AND user_id = ?');
      for (const id of b.collectors) set.run(req.familyId, Number(id));
    }
    publish(req.familyId, 'points');
    publish(req.familyId, 'family');
    res.json(settingsOf(db, req.familyId));
  });

  // Bonus oder Abzug mit Grund
  router.post(`${base}/bonus`, auth, member, managers, (req, res) => {
    const userId = Number(req.body?.user_id);
    const amount = int(req.body?.amount, -MAX_POINTS, MAX_POINTS);
    const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim().slice(0, 200) : '';
    if (!db.prepare('SELECT 1 FROM memberships WHERE family_id = ? AND user_id = ?').get(req.familyId, userId)) return res.status(400).json({ error: 'Unbekannte Person' });
    if (!amount) return res.status(400).json({ error: 'Wie viele Punkte?' });
    if (!reason) return res.status(400).json({ error: 'Bitte einen Grund angeben' });
    db.prepare('INSERT INTO points_ledger (family_id, user_id, amount, reason, source, created_by) VALUES (?, ?, ?, ?, ?, ?)')
      .run(req.familyId, userId, amount, reason, 'bonus', req.user.id);
    if (settingsOf(db, req.familyId).released) {
      push?.notify?.([userId], {
        title: amount > 0 ? `⭐ +${amount} Punkte` : `${amount} Punkte`,
        body: `${reason} – von ${nameOf(req.user.id)}`,
        path: '/punkte',
      });
    }
    publish(req.familyId, 'points');
    res.status(201).json({ balance: balanceOf(db, req.familyId, userId) });
  });

  // Buchung löschen (z. B. versehentlicher Bonus)
  router.delete(`${base}/entries/:id`, auth, member, managers, (req, res) => {
    const { changes } = db.prepare("DELETE FROM points_ledger WHERE family_id = ? AND id = ? AND source != 'reward'").run(req.familyId, Number(req.params.id));
    if (changes) publish(req.familyId, 'points');
    res.status(changes ? 204 : 404).end();
  });

  // --- Belohnungen ------------------------------------------------------------------------
  router.post(`${base}/rewards`, auth, member, managers, (req, res) => {
    const title = typeof req.body?.title === 'string' ? req.body.title.trim().slice(0, 80) : '';
    const cost = int(req.body?.cost, 1, 100_000);
    const emoji = typeof req.body?.emoji === 'string' && req.body.emoji.trim() ? [...req.body.emoji.trim()].slice(0, 2).join('') : '🎁';
    if (!title || !cost) return res.status(400).json({ error: 'Name und Punkte angeben' });
    const { lastInsertRowid } = db.prepare('INSERT INTO rewards (family_id, title, emoji, cost, created_by) VALUES (?, ?, ?, ?, ?)')
      .run(req.familyId, title, emoji, cost, req.user.id);
    publish(req.familyId, 'points');
    res.status(201).json(db.prepare('SELECT id, title, emoji, cost FROM rewards WHERE id = ?').get(lastInsertRowid));
  });
  router.delete(`${base}/rewards/:id`, auth, member, managers, (req, res) => {
    // nur ausblenden – frühere Einlösungen behalten ihren Namen
    const { changes } = db.prepare('UPDATE rewards SET active = 0 WHERE family_id = ? AND id = ?').run(req.familyId, Number(req.params.id));
    publish(req.familyId, 'points');
    res.status(changes ? 204 : 404).end();
  });

  // Einlösen: Anfrage an die Eltern; die Punkte sind ab jetzt vorgemerkt
  router.post(`${base}/rewards/:id/redeem`, auth, member, (req, res) => {
    const reward = db.prepare('SELECT * FROM rewards WHERE family_id = ? AND id = ? AND active = 1').get(req.familyId, Number(req.params.id));
    if (!reward) return res.status(404).json({ error: 'Diese Belohnung gibt es nicht mehr' });
    if (!collects(db, req.familyId, req.user.id)) return res.status(403).json({ error: 'Du sammelst keine Punkte' });
    const available = balanceOf(db, req.familyId, req.user.id) - reservedOf(db, req.familyId, req.user.id);
    if (available < reward.cost) return res.status(400).json({ error: `Dafür fehlen noch ${reward.cost - available} Punkte` });
    const { lastInsertRowid } = db.prepare(
      'INSERT INTO reward_redemptions (family_id, user_id, reward_id, title, emoji, cost) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(req.familyId, req.user.id, reward.id, reward.title, reward.emoji, reward.cost);
    notifyManagers(req.familyId, { title: `${reward.emoji} ${nameOf(req.user.id)} möchte einlösen`, body: `${reward.title} für ${reward.cost} Punkte` });
    publish(req.familyId, 'points');
    res.status(201).json(db.prepare('SELECT * FROM reward_redemptions WHERE id = ?').get(lastInsertRowid));
  });

  // Eltern entscheiden; zurückziehen kann, wer angefragt hat
  router.post(`${base}/redemptions/:id/:decision`, auth, member, (req, res) => {
    if (!['approve', 'decline', 'cancel'].includes(req.params.decision)) return res.status(404).json({ error: 'Unbekannte Aktion' });
    const r = db.prepare("SELECT * FROM reward_redemptions WHERE family_id = ? AND id = ? AND status = 'pending'").get(req.familyId, Number(req.params.id));
    if (!r) return res.status(404).json({ error: 'Nicht (mehr) offen' });
    const { decision } = req.params;
    if (decision === 'cancel' ? r.user_id !== req.user.id : !isManager(req.role)) return res.status(403).json({ error: 'Keine Berechtigung' });
    const status = { approve: 'approved', decline: 'declined', cancel: 'cancelled' }[decision];
    db.exec('BEGIN');
    try {
      db.prepare("UPDATE reward_redemptions SET status = ?, decided_by = ?, decided_at = datetime('now') WHERE id = ?").run(status, req.user.id, r.id);
      if (status === 'approved') {
        db.prepare('INSERT INTO points_ledger (family_id, user_id, amount, reason, source, ref, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)')
          .run(req.familyId, r.user_id, -r.cost, `${r.emoji} ${r.title}`, 'reward', `reward:${r.id}`, req.user.id);
      }
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
    if (status !== 'cancelled') {
      push?.notify?.([r.user_id], {
        title: status === 'approved' ? `${r.emoji} Eingelöst: ${r.title}` : `${r.emoji} ${r.title} – diesmal nicht`,
        body: status === 'approved' ? `−${r.cost} Punkte · viel Spaß!` : `${nameOf(req.user.id)} hat abgelehnt – die Punkte bleiben dir`,
        path: '/punkte',
      });
    }
    publish(req.familyId, 'points');
    res.json(db.prepare('SELECT * FROM reward_redemptions WHERE id = ?').get(r.id));
  });

  return router;
}

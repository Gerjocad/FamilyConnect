// Abhaken von Gewohnheiten: in der App, per NFC-Aufkleber (familyconnect://h/<token>) oder später per Knopf.
import { Router } from 'express';
import { isValidDate } from './crud.js';
import { todayKey } from './dates.js';
import { isManager } from './permissions.js';
import { awardPoints, revokePoints } from './points.js';

const SOURCES = ['app', 'nfc', 'button'];

/** Gleicher Name? Groß/klein, Leerzeichen und Emojis egal („Duschen“ = „duschen 🚿“) */
export const sameTitle = (a, b) => {
  const norm = (t) => t.toLocaleLowerCase('de').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  return norm(a) !== '' && norm(a) === norm(b);
};

export function habitsRouter(db, { auth, member, publish }) {
  const router = Router();

  const participants = (habit) => {
    const ids = JSON.parse(habit.member_ids);
    if (ids.length) return ids;
    return db.prepare('SELECT user_id FROM memberships WHERE family_id = ?').all(habit.family_id).map((r) => r.user_id);
  };

  const serializeCheckin = (row) => {
    const { family_id: _f, ...rest } = row;
    return rest;
  };

  /** Prüft Eingaben und legt den Eintrag an (oder liefert den vorhandenen) */
  function checkIn(habit, req, res, { userId, date, source }) {
    if (!isValidDate(date)) return res.status(400).json({ error: 'Ungültiges Datum' });
    if (!participants(habit).includes(userId)) {
      return res.status(403).json({ error: 'Diese Gewohnheit gilt nicht für diese Person' });
    }
    const existing = db.prepare('SELECT * FROM habit_checkins WHERE habit_id = ? AND user_id = ? AND date = ?')
      .get(habit.id, userId, date);
    if (existing) return res.json({ checkin: serializeCheckin(existing), already: true, habit: { id: habit.id, title: habit.title, emoji: habit.emoji, family_id: habit.family_id } });
    const { lastInsertRowid } = db.prepare(
      'INSERT INTO habit_checkins (family_id, habit_id, user_id, date, source, created_by) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(habit.family_id, habit.id, userId, date, source, req.user.id);
    publish(habit.family_id, 'checkins');
    awardPoints(db, { familyId: habit.family_id, userId, source: 'habit', ref: `habit:${habit.id}:${userId}:${date}`, reason: `${habit.emoji ?? ''} ${habit.title}`.trim(), publish });
    const row = db.prepare('SELECT * FROM habit_checkins WHERE id = ?').get(lastInsertRowid);
    res.status(201).json({ checkin: serializeCheckin(row), already: false, habit: { id: habit.id, title: habit.title, emoji: habit.emoji, family_id: habit.family_id } });
  }

  // Für wen darf abgehakt werden? Für sich selbst – Eltern und Admins auch für andere
  function targetUser(req, res) {
    const requested = req.body?.user_id;
    if (requested === undefined || requested === req.user.id) return req.user.id;
    if (!isManager(req.role)) {
      res.status(403).json({ error: 'Nur Eltern dürfen für andere abhaken' });
      return null;
    }
    return requested;
  }

  router.get('/api/families/:familyId/checkins', auth, member, (req, res) => {
    const since = typeof req.query.since === 'string' && isValidDate(req.query.since) ? req.query.since : '0000-00-00';
    const rows = db.prepare('SELECT * FROM habit_checkins WHERE family_id = ? AND date >= ? ORDER BY date DESC, id DESC')
      .all(req.familyId, since);
    res.json(rows.map(serializeCheckin));
  });

  const findHabit = (req) => db.prepare('SELECT * FROM habits WHERE family_id = ? AND id = ?').get(req.familyId, Number(req.params.habitId));

  router.post('/api/families/:familyId/habits/:habitId/checkins', auth, member, (req, res) => {
    const habit = findHabit(req);
    if (!habit) return res.status(404).json({ error: 'Nicht gefunden' });
    const userId = targetUser(req, res);
    if (userId === null) return;
    const source = SOURCES.includes(req.body?.source) ? req.body.source : 'app';
    // Hängt ein Aufkleber an der Gewohnheit, haken Kinder nur dort ab – Eltern dürfen weiter per Klick
    if (habit.nfc_linked && req.role === 'child' && source !== 'nfc') {
      return res.status(403).json({ error: 'Diese Gewohnheit wird mit dem NFC-Aufkleber abgehakt' });
    }
    checkIn(habit, req, res, { userId, date: req.body?.date ?? todayKey(), source });
  });

  router.delete('/api/families/:familyId/habits/:habitId/checkins', auth, member, (req, res) => {
    const habit = findHabit(req);
    if (!habit) return res.status(404).json({ error: 'Nicht gefunden' });
    const userId = targetUser(req, res);
    if (userId === null) return;
    const date = req.body?.date ?? todayKey();
    db.prepare('DELETE FROM habit_checkins WHERE habit_id = ? AND user_id = ? AND date = ?').run(habit.id, userId, date);
    revokePoints(db, { familyId: habit.family_id, ref: `habit:${habit.id}:${userId}:${date}`, publish });
    publish(habit.family_id, 'checkins');
    res.status(204).end();
  });

  // NFC-Aufkleber: Handy daranhalten → App öffnet familyconnect://h/<token> → abhaken für die angemeldete Person
  router.post('/api/habits/by-token/:token/checkin', auth, (req, res) => {
    const habit = db.prepare('SELECT * FROM habits WHERE nfc_token = ?').get(String(req.params.token).toLowerCase());
    const isMember = habit && db.prepare('SELECT 1 FROM memberships WHERE family_id = ? AND user_id = ?').get(habit.family_id, req.user.id);
    if (!habit || !isMember) return res.status(404).json({ error: 'Dieser Aufkleber gehört zu keiner Gewohnheit deiner Familie' });
    // Gilt die Gewohnheit nicht für mich, aber es gibt eine gleichnamige für mich (z. B. „Duschen“ für Lea
    // und für Tom)? Dann zählt derselbe Aufkleber dafür – ein Aufkleber im Bad reicht für alle.
    let target = habit;
    if (!participants(habit).includes(req.user.id)) {
      target = db.prepare('SELECT * FROM habits WHERE family_id = ? AND id != ?').all(habit.family_id, habit.id)
        .find((h) => sameTitle(h.title, habit.title) && participants(h).includes(req.user.id)) ?? habit;
    }
    // Der Aufkleber funktioniert – ab jetzt ist die Gewohnheit mit ihm verknüpft
    const unlinked = [...new Set([habit, target])].filter((h) => !h.nfc_linked);
    for (const h of unlinked) db.prepare('UPDATE habits SET nfc_linked = 1 WHERE id = ?').run(h.id);
    if (unlinked.length) publish(habit.family_id, 'habits');
    checkIn(target, req, res, { userId: req.user.id, date: req.body?.date ?? todayKey(), source: 'nfc' });
  });

  // Aufkleber lösen (oder verloren): neuer Code, der alte Aufkleber funktioniert nicht mehr
  // und alle können wieder per Klick abhaken
  router.post('/api/families/:familyId/habits/:habitId/nfc-token', auth, member, (req, res) => {
    const habit = findHabit(req);
    if (!habit) return res.status(404).json({ error: 'Nicht gefunden' });
    if (!isManager(req.role)) return res.status(403).json({ error: 'Nur Eltern dürfen den Aufkleber lösen' });
    db.prepare('UPDATE habits SET nfc_token = lower(hex(randomblob(16))), nfc_linked = 0 WHERE id = ?').run(habit.id);
    publish(habit.family_id, 'habits');
    res.json({ nfc_token: db.prepare('SELECT nfc_token FROM habits WHERE id = ?').get(habit.id).nfc_token });
  });

  return router;
}

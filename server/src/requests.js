// Anfragen („Darf ich …?“) an eine bestimmte Person: Ja (mit Notiz), Nein (mit Begründung) oder
// Gegenvorschlag, den der Fragende annehmen oder ablehnen kann. Sichtbar für Beteiligte und Eltern.
import { Router } from 'express';
import { isValidDate } from './crud.js';
import { isManager } from './permissions.js';

export const CATEGORIES = ['general', 'friends', 'free', 'sleepover', 'media', 'money', 'ride'];
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

class RequestError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const text = (value, max) => (typeof value === 'string' ? value.trim().slice(0, max) : '');

/** Optionaler Zeitpunkt: Tag, dazu optional von/bis */
function when(body, prefix = '') {
  const date = body?.[`${prefix}date`] || null;
  const from = body?.[`${prefix}time_from`] || null;
  const to = body?.[`${prefix}time_to`] || null;
  if (date !== null && !isValidDate(date)) throw new RequestError(400, 'Ungültiges Datum');
  for (const t of [from, to]) if (t !== null && !TIME_RE.test(t)) throw new RequestError(400, 'Ungültige Uhrzeit');
  if ((from || to) && !date) throw new RequestError(400, 'Bitte zur Uhrzeit auch den Tag angeben');
  if (from && to && to < from) throw new RequestError(400, 'Das Ende darf nicht vor dem Beginn liegen');
  return { date, from, to };
}

export function requestsRouter(db, { auth, member, publish, push }) {
  const router = Router();
  const base = '/api/families/:familyId/requests';

  const find = (req) => db.prepare('SELECT * FROM requests WHERE family_id = ? AND id = ?').get(req.familyId, Number(req.params.id));
  const serialize = (row) => ({ ...row, family_id: undefined, counter_accepted: Boolean(row.counter_accepted) });
  const canSee = (req, row) => isManager(req.role) || row.created_by === req.user.id || row.recipient_id === req.user.id;
  const first = (name) => name.split(' ')[0];
  const notify = (userId, title, body) => {
    if (userId) push?.notify([userId], { title, body, path: '/anfragen' });
  };

  /** Fehler einheitlich beantworten; `fn` liefert die Antwort-Zeile */
  const handle = (fn) => (req, res) => {
    try {
      const row = fn(req);
      if (row === null) return res.status(204).end();
      publish(req.familyId, 'requests');
      res.status(req.method === 'POST' && req.path.endsWith('/requests') ? 201 : 200).json(serialize(row));
    } catch (err) {
      if (err instanceof RequestError) return res.status(err.status).json({ error: err.message });
      throw err;
    }
  };

  /** Anfrage laden, Sichtbarkeit und erwarteten Status prüfen */
  const load = (req, { role, statuses }) => {
    const row = find(req);
    if (!row || !canSee(req, row)) throw new RequestError(404, 'Nicht gefunden');
    const allowed = role === 'recipient' ? row.recipient_id === req.user.id : row.created_by === req.user.id;
    if (!allowed) throw new RequestError(403, role === 'recipient' ? 'Antworten kann nur, wer gefragt wurde' : 'Das kann nur, wer gefragt hat');
    if (!statuses.includes(row.status)) throw new RequestError(409, 'Die Anfrage wurde schon beantwortet');
    return row;
  };

  router.get(`${base}`, auth, member, (req, res) => {
    const rows = db.prepare(
      `SELECT * FROM requests WHERE family_id = ? AND (? OR created_by = ? OR recipient_id = ?)
       ORDER BY status NOT IN ('pending', 'countered'), updated_at DESC, id DESC LIMIT 300`
    ).all(req.familyId, isManager(req.role) ? 1 : 0, req.user.id, req.user.id);
    res.json(rows.map(serialize));
  });

  router.post(`${base}`, auth, member, handle((req) => {
    const title = text(req.body?.title, 200);
    const details = text(req.body?.details, 1000);
    const category = CATEGORIES.includes(req.body?.category) ? req.body.category : 'general';
    const recipientId = req.body?.recipient_id;
    if (!title) throw new RequestError(400, 'Bitte schreib deine Frage auf');
    const isMember = Number.isInteger(recipientId) &&
      db.prepare('SELECT 1 FROM memberships WHERE family_id = ? AND user_id = ?').get(req.familyId, recipientId);
    if (!isMember) throw new RequestError(400, 'Bitte wähle aus, wen du fragst');
    if (recipientId === req.user.id) throw new RequestError(400, 'Dich selbst musst du nicht fragen 😉');
    const { date, from, to } = when(req.body);
    const { lastInsertRowid } = db.prepare(
      `INSERT INTO requests (family_id, created_by, recipient_id, category, title, details, date, time_from, time_to)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(req.familyId, req.user.id, recipientId, category, title, details, date, from, to);
    notify(recipientId, `Anfrage von ${first(req.user.name)}`, title);
    return db.prepare('SELECT * FROM requests WHERE id = ?').get(lastInsertRowid);
  }));

  // Antwort der gefragten Person
  router.post(`${base}/:id/respond`, auth, member, handle((req) => {
    const row = load(req, { role: 'recipient', statuses: ['pending'] });
    const decision = req.body?.decision;
    const note = text(req.body?.note, 1000);
    const by = first(req.user.name);
    if (decision === 'approve' || decision === 'decline') {
      db.prepare(`UPDATE requests SET status = ?, response_note = ?, responded_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`)
        .run(decision === 'approve' ? 'approved' : 'declined', note, row.id);
      notify(row.created_by, decision === 'approve' ? `${by} sagt Ja ✅` : `${by} sagt Nein`, note ? `${row.title} – ${note}` : row.title);
    } else if (decision === 'counter') {
      if (!note) throw new RequestError(400, 'Bitte beschreib deinen Gegenvorschlag');
      const counter = when(req.body, 'counter_');
      db.prepare(
        `UPDATE requests SET status = 'countered', response_note = ?, counter_date = ?, counter_time_from = ?, counter_time_to = ?,
         responded_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`
      ).run(note, counter.date, counter.from, counter.to, row.id);
      notify(row.created_by, `${by} hat einen Gegenvorschlag`, note);
    } else {
      throw new RequestError(400, 'Ungültige Antwort');
    }
    return find(req);
  }));

  // Gegenvorschlag annehmen oder ablehnen
  router.post(`${base}/:id/counter`, auth, member, handle((req) => {
    const row = load(req, { role: 'creator', statuses: ['countered'] });
    const accept = req.body?.accept === true;
    db.prepare(`UPDATE requests SET status = ?, counter_accepted = ?, updated_at = datetime('now') WHERE id = ?`)
      .run(accept ? 'approved' : 'withdrawn', accept ? 1 : 0, row.id);
    notify(row.recipient_id, accept ? `${first(req.user.name)} nimmt deinen Vorschlag an 👍` : `${first(req.user.name)} lehnt deinen Vorschlag ab`, row.title);
    return find(req);
  }));

  router.post(`${base}/:id/withdraw`, auth, member, handle((req) => {
    load(req, { role: 'creator', statuses: ['pending', 'countered'] });
    db.prepare(`UPDATE requests SET status = 'withdrawn', updated_at = datetime('now') WHERE id = ?`).run(Number(req.params.id));
    return find(req);
  }));

  // Genehmigte Anfrage mit Tag als Termin für den Fragenden eintragen
  router.post(`${base}/:id/calendar`, auth, member, handle((req) => {
    const row = load(req, { role: 'creator', statuses: ['approved'] });
    if (row.event_id) throw new RequestError(409, 'Steht schon im Kalender');
    const date = row.counter_accepted ? row.counter_date ?? row.date : row.date;
    const from = row.counter_accepted && row.counter_date ? row.counter_time_from : row.time_from;
    const to = row.counter_accepted && row.counter_date ? row.counter_time_to : row.time_to;
    if (!date) throw new RequestError(400, 'Die Anfrage hat keinen Tag');
    const allDay = !from;
    const start = `${date}T${from ?? '00:00'}`;
    const end = `${date}T${to ?? (from ? addHour(from) : '23:59')}`;
    const notes = [row.details, row.response_note && `Antwort: ${row.response_note}`].filter(Boolean).join('\n');
    const { lastInsertRowid } = db.prepare(
      `INSERT INTO events (family_id, created_by, title, description, start, "end", all_day, member_ids)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(req.familyId, req.user.id, row.title, notes, start, end, allDay ? 1 : 0, JSON.stringify([row.created_by]));
    db.prepare('UPDATE requests SET event_id = ? WHERE id = ?').run(Number(lastInsertRowid), row.id);
    publish(req.familyId, 'events');
    return find(req);
  }));

  // Aufräumen: wer gefragt hat sowie Eltern und Admins
  router.delete(`${base}/:id`, auth, member, (req, res) => {
    const row = find(req);
    if (!row || !canSee(req, row)) return res.status(404).json({ error: 'Nicht gefunden' });
    if (row.created_by !== req.user.id && !isManager(req.role)) return res.status(403).json({ error: 'Keine Berechtigung' });
    db.prepare('DELETE FROM requests WHERE id = ?').run(row.id);
    publish(req.familyId, 'requests');
    res.status(204).end();
  });

  return router;
}

function addHour(time) {
  const [h, m] = time.split(':').map(Number);
  return h >= 23 ? '23:59' : `${String(h + 1).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// Haushaltskasse: Zwei (oder mehr) Erwachsene tragen ihre eigenen Einnahmen und Ausgaben ein, dazu die
// gemeinsamen. Daraus wird berechnet, wie viel jede Person monatlich von ihrem eigenen Konto aufs
// Gemeinschaftskonto überweist. Nur Erwachsene (Admin/Eltern) sehen und ändern die Finanzen.
import { Router } from 'express';
import { isManager } from './permissions.js';

export const METHODS = ['income', 'available', 'same_rest', 'equal'];
export const INTERVALS = [1, 3, 6, 12];
const ROUNDINGS = [0, 1, 5, 10, 50, 100];
const MAX_AMOUNT = 100_000_000; // 1 Mio. € in Cent

const text = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/** Monatlicher Anteil eines Eintrags in Cent (jährliche Kosten = monatliche Rücklage) */
export const monthly = (entry) => entry.amount / entry.interval_months;

/**
 * Teilt den Bedarf des Gemeinschaftskontos auf die Personen auf.
 *   income    – im Verhältnis der Einnahmen
 *   available – im Verhältnis dessen, was nach den eigenen Ausgaben übrig bleibt
 *   same_rest – so, dass allen danach gleich viel zum Leben bleibt (niemand zahlt weniger als 0)
 *   equal     – halbe-halbe
 * Alle Beträge in Cent pro Monat.
 */
export function splitShared({ people, sharedIncome, sharedExpenses, method, roundTo = 0, bufferPercent = 0 }) {
  const gap = Math.max(0, sharedExpenses - sharedIncome);
  const need = gap * (1 + bufferPercent / 100);
  const free = people.map((p) => p.income - p.expenses);
  const n = people.length;
  let raw;
  const byWeights = (weights) => {
    const sum = weights.reduce((a, b) => a + b, 0);
    return sum > 0 ? weights.map((w) => (need * w) / sum) : people.map(() => need / n);
  };
  if (!n) raw = [];
  else if (method === 'equal') raw = people.map(() => need / n);
  else if (method === 'income') raw = byWeights(people.map((p) => Math.max(0, p.income)));
  else if (method === 'available') raw = byWeights(free.map((f) => Math.max(0, f)));
  else {
    // gleicher Rest R für alle, die etwas zahlen: Σ max(0, frei − R) = Bedarf
    const sorted = [...free].sort((a, b) => b - a);
    let rest = 0;
    let sum = 0;
    for (let k = 1; k <= n; k += 1) {
      sum += sorted[k - 1];
      rest = (sum - need) / k;
      if (k === n || sorted[k] <= rest) break;
    }
    raw = need > 0 ? free.map((f) => Math.max(0, f - rest)) : free.map(() => 0);
  }
  // Aufrunden, damit das Gemeinschaftskonto nie zu wenig bekommt
  const step = roundTo * 100;
  const transfers = raw.map((t) => (t <= 0 ? 0 : step ? Math.ceil(Math.round(t) / step) * step : Math.round(t)));
  const total = transfers.reduce((a, b) => a + b, 0);
  return {
    method,
    need: Math.round(need),
    total,
    // was monatlich auf dem Gemeinschaftskonto übrig bleibt (Puffer, Rundung)
    balance: Math.round(total + sharedIncome - sharedExpenses),
    people: people.map((p, i) => ({
      member_id: p.id,
      income: Math.round(p.income),
      expenses: Math.round(p.expenses),
      transfer: transfers[i],
      share: total ? transfers[i] / total : 0,
      remaining: Math.round(free[i] - transfers[i]),
    })),
  };
}

export function financeRouter(db, { auth, member, publish }) {
  const router = Router();
  const base = '/api/families/:familyId/finance';

  const adultsOnly = (req, res, next) => {
    if (!isManager(req.role)) return res.status(403).json({ error: 'Die Finanzen sehen nur Erwachsene' });
    next();
  };
  const guard = [auth, member, adultsOnly];

  const memberIds = (familyId) => db.prepare('SELECT user_id, role FROM memberships WHERE family_id = ?').all(familyId);
  const isMemberOf = (familyId, id) => memberIds(familyId).some((m) => m.user_id === id);

  const settingsOf = (familyId) => {
    const row = db.prepare('SELECT * FROM finance_settings WHERE family_id = ?').get(familyId);
    const members = memberIds(familyId);
    const chosen = row ? JSON.parse(row.member_ids).filter((id) => members.some((m) => m.user_id === id)) : [];
    return {
      method: row?.method ?? 'income',
      member_ids: chosen,
      round_to: row?.round_to ?? 10,
      buffer_percent: row?.buffer_percent ?? 0,
      // wer tatsächlich einzahlt: die ausgewählten Personen, sonst alle Erwachsenen
      participants: chosen.length ? chosen : members.filter((m) => isManager(m.role)).map((m) => m.user_id),
    };
  };

  const serialize = (row) => ({
    id: row.id,
    owner_id: row.owner_id,
    kind: row.kind,
    title: row.title,
    amount: row.amount,
    interval_months: row.interval_months,
    category: row.category,
    notes: row.notes,
    created_by: row.created_by,
    created_at: row.created_at,
  });

  const overview = (familyId) => {
    const entries = db.prepare('SELECT * FROM finance_entries WHERE family_id = ? ORDER BY kind DESC, amount DESC, id').all(familyId);
    const settings = settingsOf(familyId);
    const sum = (list) => list.reduce((a, e) => a + monthly(e), 0);
    const shared = entries.filter((e) => e.owner_id === null);
    const sharedIncome = sum(shared.filter((e) => e.kind === 'income'));
    const sharedExpenses = sum(shared.filter((e) => e.kind === 'expense'));
    const people = settings.participants.map((id) => {
      const own = entries.filter((e) => e.owner_id === id);
      return { id, income: sum(own.filter((e) => e.kind === 'income')), expenses: sum(own.filter((e) => e.kind === 'expense')) };
    });
    const results = Object.fromEntries(METHODS.map((method) => [method, splitShared({
      people, sharedIncome, sharedExpenses, method, roundTo: settings.round_to, bufferPercent: settings.buffer_percent,
    })]));
    return {
      entries: entries.map(serialize),
      settings,
      shared: { income: Math.round(sharedIncome), expenses: Math.round(sharedExpenses) },
      results,
    };
  };

  /** Felder aus dem Formular; Fehlermeldung als String */
  const fields = (req, body, existing) => {
    const pick = (name) => (body && name in body ? body[name] : existing?.[name]);
    const ownerId = pick('owner_id') ?? null;
    if (ownerId !== null && !isMemberOf(req.familyId, ownerId)) return 'Wem gehört der Eintrag?';
    const kind = pick('kind');
    if (!['income', 'expense'].includes(kind)) return 'Einnahme oder Ausgabe?';
    const title = text(pick('title'), 100);
    if (!title) return 'Wofür ist der Betrag?';
    const amount = pick('amount');
    if (!Number.isInteger(amount) || amount <= 0 || amount > MAX_AMOUNT) return 'Bitte einen gültigen Betrag eingeben';
    const interval = pick('interval_months') ?? 1;
    if (!INTERVALS.includes(interval)) return 'Ungültiger Rhythmus';
    return {
      owner_id: ownerId, kind, title, amount, interval_months: interval,
      category: text(pick('category'), 50), notes: text(pick('notes'), 500),
    };
  };

  const find = (req) => db.prepare('SELECT * FROM finance_entries WHERE family_id = ? AND id = ?').get(req.familyId, Number(req.params.id));

  router.get(base, ...guard, (req, res) => res.json(overview(req.familyId)));

  router.post(`${base}/entries`, ...guard, (req, res) => {
    const f = fields(req, req.body, null);
    if (typeof f === 'string') return res.status(400).json({ error: f });
    const { lastInsertRowid } = db.prepare(
      `INSERT INTO finance_entries (family_id, owner_id, kind, title, amount, interval_months, category, notes, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(req.familyId, f.owner_id, f.kind, f.title, f.amount, f.interval_months, f.category, f.notes, req.user.id);
    publish(req.familyId, 'finance');
    res.status(201).json(serialize(db.prepare('SELECT * FROM finance_entries WHERE id = ?').get(lastInsertRowid)));
  });

  router.patch(`${base}/entries/:id`, ...guard, (req, res) => {
    const row = find(req);
    if (!row) return res.status(404).json({ error: 'Eintrag nicht gefunden' });
    const f = fields(req, req.body, row);
    if (typeof f === 'string') return res.status(400).json({ error: f });
    db.prepare(
      'UPDATE finance_entries SET owner_id = ?, kind = ?, title = ?, amount = ?, interval_months = ?, category = ?, notes = ? WHERE id = ?'
    ).run(f.owner_id, f.kind, f.title, f.amount, f.interval_months, f.category, f.notes, row.id);
    publish(req.familyId, 'finance');
    res.json(serialize(find(req)));
  });

  router.delete(`${base}/entries/:id`, ...guard, (req, res) => {
    const row = find(req);
    if (!row) return res.status(404).json({ error: 'Eintrag nicht gefunden' });
    db.prepare('DELETE FROM finance_entries WHERE id = ?').run(row.id);
    publish(req.familyId, 'finance');
    res.status(204).end();
  });

  router.put(`${base}/settings`, ...guard, (req, res) => {
    const current = settingsOf(req.familyId);
    const body = req.body ?? {};
    const method = body.method ?? current.method;
    if (!METHODS.includes(method)) return res.status(400).json({ error: 'Unbekannte Aufteilung' });
    const ids = body.member_ids ?? current.member_ids;
    if (!Array.isArray(ids) || !ids.every((id) => isMemberOf(req.familyId, id)))
      return res.status(400).json({ error: 'Nur Familienmitglieder können einzahlen' });
    const roundTo = body.round_to ?? current.round_to;
    if (!ROUNDINGS.includes(roundTo)) return res.status(400).json({ error: 'Ungültige Rundung' });
    const buffer = body.buffer_percent ?? current.buffer_percent;
    if (!Number.isInteger(buffer) || buffer < 0 || buffer > 50) return res.status(400).json({ error: 'Der Puffer muss zwischen 0 und 50 % liegen' });
    db.prepare(
      `INSERT INTO finance_settings (family_id, method, member_ids, round_to, buffer_percent) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(family_id) DO UPDATE SET method = excluded.method, member_ids = excluded.member_ids,
         round_to = excluded.round_to, buffer_percent = excluded.buffer_percent`
    ).run(req.familyId, method, JSON.stringify([...new Set(ids)]), roundTo, buffer);
    publish(req.familyId, 'finance');
    res.json(overview(req.familyId));
  });

  return router;
}

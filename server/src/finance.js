// Finanzen: nur für Eltern und Admins.
// Jede erwachsene Person trägt Einkommen und eigene Ausgaben ein, dazu kommen die Ausgaben (und Einnahmen, z. B.
// Kindergeld) des gemeinsamen Kontos. Daraus berechnet der Server, wer monatlich wie viel aufs gemeinsame Konto
// überweist: prozentual nach Einkommen, nach dem, was übrig bleibt, oder mit festen Prozenten – plus manuelle
// Zu- oder Abschläge je Person. Beträge sind ganze Cent; vierteljährlich/jährlich wird auf den Monat umgerechnet.
// Private Ausgaben sieht nur, wem sie gehören (in der Berechnung „nach Rest“ zählen sie trotzdem mit).
import { Router } from 'express';
import { isManager } from './permissions.js';

export const KINDS = ['income', 'expense', 'adjustment'];
export const INTERVALS = { monthly: 1, quarterly: 3, yearly: 12 };
export const MODES = ['income', 'remaining', 'custom'];
const MAX_AMOUNT = 100_000_000; // 1 Mio. € in Cent

export const monthly = (e) => Math.round(e.amount / INTERVALS[e.interval]);

/** Die Erwachsenen der Familie (Eltern und Admins) */
const participantsOf = (db, familyId) => db.prepare(
  "SELECT u.id, u.name FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.family_id = ? AND m.role IN ('admin', 'parent') ORDER BY m.joined_at, u.id"
).all(familyId);

const settingsOf = (db, familyId) => {
  const row = db.prepare('SELECT mode, shares FROM finance_settings WHERE family_id = ?').get(familyId);
  return { mode: row?.mode ?? 'income', shares: JSON.parse(row?.shares ?? '{}') };
};

/**
 * Wer zahlt wie viel aufs gemeinsame Konto (alles pro Monat, in Cent).
 * needed = gemeinsame Ausgaben − gemeinsame Einnahmen; aufgeteilt nach Anteil, danach die manuellen Beträge.
 */
export function calculate(entries, people, settings) {
  const sum = (list) => list.reduce((a, e) => a + monthly(e), 0);
  const shared = entries.filter((e) => e.owner_id === null);
  const sharedExpenses = sum(shared.filter((e) => e.kind === 'expense'));
  const sharedIncome = sum(shared.filter((e) => e.kind === 'income'));
  const needed = Math.max(0, sharedExpenses - sharedIncome);
  const rows = people.map((p) => {
    const own = entries.filter((e) => e.owner_id === p.id);
    const income = sum(own.filter((e) => e.kind === 'income'));
    const expenses = sum(own.filter((e) => e.kind === 'expense'));
    const adjustments = sum(own.filter((e) => e.kind === 'adjustment'));
    return { user_id: p.id, income, expenses, adjustments };
  });
  const basis = (r) => {
    if (settings.mode === 'custom') return Math.max(0, Number(settings.shares[r.user_id]) || 0);
    if (settings.mode === 'remaining') return Math.max(0, r.income - r.expenses);
    return Math.max(0, r.income);
  };
  const total = rows.reduce((a, r) => a + basis(r), 0);
  // Ohne Grundlage (noch nichts eingetragen) zu gleichen Teilen
  const shareOf = (r) => (total > 0 ? basis(r) / total : 1 / rows.length);
  let assigned = 0;
  const result = rows.map((r, i) => {
    // Rundungsrest bekommt die letzte Person, damit die Summe genau stimmt
    const part = i === rows.length - 1 ? needed - assigned : Math.round(needed * shareOf(r));
    assigned += part;
    const transfer = part + r.adjustments;
    return { ...r, share: shareOf(r), part, transfer, left: r.income - r.expenses - transfer };
  });
  return { shared_expenses: sharedExpenses, shared_income: sharedIncome, needed, people: result };
}

export function financeRouter(db, { auth, member, publish }) {
  const router = Router();
  const base = '/api/families/:familyId/finance';
  const managers = (req, res, next) => (isManager(req.role) ? next() : res.status(403).json({ error: 'Finanzen sehen nur Eltern und Admins' }));
  const serialize = (e) => ({ ...e, private: Boolean(e.private) });
  const visible = (req) => (e) => !e.private || e.owner_id === req.user.id;

  const parse = (req, existing) => {
    const b = { ...existing, ...req.body };
    const people = participantsOf(db, req.familyId).map((p) => p.id);
    const owner = b.owner_id == null ? null : Number(b.owner_id);
    if (owner !== null && !people.includes(owner)) return { error: 'Unbekannte Person' };
    if (!KINDS.includes(b.kind)) return { error: 'Unbekannte Art' };
    if (b.kind === 'adjustment' && owner === null) return { error: 'Zu- und Abschläge gehören zu einer Person' };
    const title = typeof b.title === 'string' ? b.title.trim().slice(0, 100) : '';
    if (!title) return { error: 'Bitte eine Bezeichnung eingeben' };
    const amount = Number(b.amount);
    if (!Number.isInteger(amount) || Math.abs(amount) > MAX_AMOUNT) return { error: 'Ungültiger Betrag' };
    if (amount < 0 && b.kind !== 'adjustment') return { error: 'Der Betrag muss positiv sein' };
    if (!INTERVALS[b.interval]) return { error: 'Ungültiger Zeitraum' };
    // Privat geht nur bei eigenen Ausgaben (Einkommen braucht die Berechnung sichtbar)
    const priv = Boolean(b.private) && b.kind === 'expense' && owner !== null && owner === req.user.id;
    const category = typeof b.category === 'string' ? b.category.trim().slice(0, 50) : '';
    return { row: { owner_id: owner, kind: b.kind, title, amount, interval: b.interval, category, private: priv ? 1 : 0 } };
  };

  const find = (req) => {
    const e = db.prepare('SELECT * FROM finance_entries WHERE family_id = ? AND id = ?').get(req.familyId, Number(req.params.id));
    return e && visible(req)(e) ? e : null;
  };

  router.get(base, auth, member, managers, (req, res) => {
    const people = participantsOf(db, req.familyId);
    const all = db.prepare('SELECT * FROM finance_entries WHERE family_id = ? ORDER BY kind, amount DESC, id').all(req.familyId);
    const settings = settingsOf(db, req.familyId);
    res.json({ people, settings, entries: all.filter(visible(req)).map(serialize), summary: calculate(all, people, settings) });
  });

  router.post(`${base}/entries`, auth, member, managers, (req, res) => {
    const { row, error } = parse(req, {});
    if (error) return res.status(400).json({ error });
    const { lastInsertRowid } = db.prepare(
      'INSERT INTO finance_entries (family_id, owner_id, kind, title, amount, interval, category, private, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(req.familyId, row.owner_id, row.kind, row.title, row.amount, row.interval, row.category, row.private, req.user.id);
    publish(req.familyId, 'finance');
    res.status(201).json(serialize(db.prepare('SELECT * FROM finance_entries WHERE id = ?').get(lastInsertRowid)));
  });

  router.patch(`${base}/entries/:id`, auth, member, managers, (req, res) => {
    const existing = find(req);
    if (!existing) return res.status(404).json({ error: 'Nicht gefunden' });
    const { row, error } = parse(req, { ...existing, private: Boolean(existing.private) });
    if (error) return res.status(400).json({ error });
    db.prepare('UPDATE finance_entries SET owner_id = ?, kind = ?, title = ?, amount = ?, interval = ?, category = ?, private = ? WHERE id = ?')
      .run(row.owner_id, row.kind, row.title, row.amount, row.interval, row.category, row.private, existing.id);
    publish(req.familyId, 'finance');
    res.json(serialize(db.prepare('SELECT * FROM finance_entries WHERE id = ?').get(existing.id)));
  });

  router.delete(`${base}/entries/:id`, auth, member, managers, (req, res) => {
    const existing = find(req);
    if (!existing) return res.status(404).json({ error: 'Nicht gefunden' });
    db.prepare('DELETE FROM finance_entries WHERE id = ?').run(existing.id);
    publish(req.familyId, 'finance');
    res.status(204).end();
  });

  // { mode, shares: { [userId]: Prozent } }
  router.put(`${base}/settings`, auth, member, managers, (req, res) => {
    const mode = req.body?.mode;
    if (!MODES.includes(mode)) return res.status(400).json({ error: 'Unbekannte Aufteilung' });
    const people = participantsOf(db, req.familyId).map((p) => p.id);
    const shares = {};
    for (const [id, value] of Object.entries(req.body?.shares ?? {})) {
      const n = Number(value);
      if (people.includes(Number(id)) && Number.isFinite(n) && n >= 0 && n <= 100) shares[id] = n;
    }
    db.prepare('INSERT INTO finance_settings (family_id, mode, shares) VALUES (?, ?, ?) ON CONFLICT (family_id) DO UPDATE SET mode = excluded.mode, shares = excluded.shares')
      .run(req.familyId, mode, JSON.stringify(shares));
    publish(req.familyId, 'finance');
    res.json(settingsOf(db, req.familyId));
  });

  return router;
}

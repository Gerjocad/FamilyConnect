// Kniffel online: 2–6 Spieler aus der Familie, jeder auf seinem Handy, reihum.
// Gewürfelt wird auf dem Server (niemand kann sich Würfel aussuchen); alle sehen live, was gerade fällt.
import { randomInt } from 'node:crypto';
import { Router } from 'express';

const UPPER = { ones: 1, twos: 2, threes: 3, fours: 4, fives: 5, sixes: 6 };
export const CATEGORIES = [...Object.keys(UPPER), 'three', 'four', 'full', 'small', 'large', 'kniffel', 'chance'];
const BONUS_AT = 63;
const BONUS = 35;
const MAX_PLAYERS = 6;

/** Punkte für diese Würfel in der Kategorie (gleiche Regeln wie client/src/pages/KniffelPage.tsx) */
export function points(cat, dice) {
  const counts = [0, 0, 0, 0, 0, 0, 0];
  for (const d of dice) counts[d]++;
  const sum = dice.reduce((a, b) => a + b, 0);
  const max = Math.max(...counts);
  const has = (run) => run.every((n) => counts[n] > 0);
  if (UPPER[cat]) return counts[UPPER[cat]] * UPPER[cat];
  switch (cat) {
    case 'three': return max >= 3 ? sum : 0;
    case 'four': return max >= 4 ? sum : 0;
    case 'full': return counts.includes(3) && counts.includes(2) ? 25 : 0;
    case 'small': return has([1, 2, 3, 4]) || has([2, 3, 4, 5]) || has([3, 4, 5, 6]) ? 30 : 0;
    case 'large': return has([1, 2, 3, 4, 5]) || has([2, 3, 4, 5, 6]) ? 40 : 0;
    case 'kniffel': return max === 5 ? 50 : 0;
    default: return sum;
  }
}
export const total = (sheet) => {
  const upper = Object.keys(UPPER).reduce((a, c) => a + (sheet[c] ?? 0), 0);
  return CATEGORIES.reduce((a, c) => a + (sheet[c] ?? 0), 0) + (upper >= BONUS_AT ? BONUS : 0);
};

export function kniffelRouter(db, { auth, member, publish, push }) {
  const router = Router();
  const base = '/api/families/:familyId/games/kniffel';
  const nameOf = (userId) => db.prepare('SELECT name FROM users WHERE id = ?').get(userId)?.name.split(' ')[0] ?? '';
  const serialize = (m) => {
    const state = JSON.parse(m.state);
    return { id: m.id, players: JSON.parse(m.players), ...state, status: m.status, created_by: m.created_by, updated_at: m.updated_at };
  };
  const find = (req) => {
    const m = db.prepare('SELECT * FROM kniffel_matches WHERE family_id = ? AND id = ?').get(req.familyId, Number(req.params.id));
    return m && JSON.parse(m.players).includes(req.user.id) ? m : null;
  };
  const save = (m, state, status = m.status) =>
    db.prepare("UPDATE kniffel_matches SET state = ?, status = ?, updated_at = datetime('now') WHERE id = ?").run(JSON.stringify(state), status, m.id);
  const reload = (id) => serialize(db.prepare('SELECT * FROM kniffel_matches WHERE id = ?').get(id));
  const turnOf = (req, res) => {
    const m = find(req);
    if (!m) return res.status(404).json({ error: 'Dieses Spiel gibt es nicht' }), null;
    if (m.status !== 'active') return res.status(409).json({ error: 'Das Spiel ist vorbei' }), null;
    const state = JSON.parse(m.state);
    if (JSON.parse(m.players)[state.current] !== req.user.id) return res.status(409).json({ error: 'Du bist nicht dran' }), null;
    return { m, state };
  };

  // Meine Kniffel-Spiele
  router.get(base, auth, member, (req, res) => {
    const rows = db.prepare("SELECT * FROM kniffel_matches WHERE family_id = ? ORDER BY status = 'active' DESC, updated_at DESC LIMIT 40").all(req.familyId);
    res.json(rows.filter((m) => JSON.parse(m.players).includes(req.user.id)).slice(0, 20).map(serialize));
  });

  router.get(`${base}/:id`, auth, member, (req, res) => {
    const m = find(req);
    if (!m) return res.status(404).json({ error: 'Dieses Spiel gibt es nicht' });
    res.json(serialize(m));
  });

  // Neues Spiel: ich + eingeladene Familienmitglieder (Reihenfolge = Spielreihenfolge, ich fange an)
  router.post(base, auth, member, (req, res) => {
    const invited = Array.isArray(req.body?.players) ? [...new Set(req.body.players.map(Number))].filter((id) => id !== req.user.id) : [];
    if (invited.length < 1) return res.status(400).json({ error: 'Lade mindestens eine Person ein' });
    if (invited.length + 1 > MAX_PLAYERS) return res.status(400).json({ error: `Höchstens ${MAX_PLAYERS} Spieler` });
    const isMember = db.prepare('SELECT 1 FROM memberships WHERE family_id = ? AND user_id = ?');
    if (invited.some((id) => !isMember.get(req.familyId, id))) return res.status(400).json({ error: 'Unbekannte Person' });
    const players = [req.user.id, ...invited];
    const state = { sheets: players.map(() => ({})), current: 0, dice: [0, 0, 0, 0, 0], held: [false, false, false, false, false], rolls: 0 };
    const { lastInsertRowid } = db.prepare('INSERT INTO kniffel_matches (family_id, players, state, created_by) VALUES (?, ?, ?, ?)')
      .run(req.familyId, JSON.stringify(players), JSON.stringify(state), req.user.id);
    push?.notify?.(invited, {
      title: `🎲 ${nameOf(req.user.id)} lädt dich zu Kniffel ein`,
      body: `${players.length} Spieler: ${players.map(nameOf).join(', ')}`,
      path: `/spiele/kniffel/${lastInsertRowid}`,
    });
    publish(req.familyId, 'games');
    res.status(201).json(reload(lastInsertRowid));
  });

  // Würfeln: { held: [bool × 5] } – gehaltene Würfel bleiben (erst ab dem 2. Wurf)
  router.post(`${base}/:id/roll`, auth, member, (req, res) => {
    const turn = turnOf(req, res);
    if (!turn) return;
    const { m, state } = turn;
    if (state.rolls >= 3) return res.status(409).json({ error: 'Schon dreimal gewürfelt – jetzt eintragen' });
    const held = Array.isArray(req.body?.held) && state.rolls > 0 ? req.body.held.slice(0, 5).map(Boolean) : [false, false, false, false, false];
    state.dice = state.dice.map((d, i) => (held[i] ? d : randomInt(1, 7)));
    state.held = held;
    state.rolls += 1;
    save(m, state);
    publish(req.familyId, 'games');
    res.json(reload(m.id));
  });

  // Eintragen: { category } – danach ist der Nächste dran
  router.post(`${base}/:id/score`, auth, member, (req, res) => {
    const turn = turnOf(req, res);
    if (!turn) return;
    const { m, state } = turn;
    const cat = req.body?.category;
    if (!CATEGORIES.includes(cat)) return res.status(400).json({ error: 'Unbekanntes Feld' });
    if (state.rolls === 0) return res.status(409).json({ error: 'Erst würfeln' });
    const sheet = state.sheets[state.current];
    if (sheet[cat] !== undefined) return res.status(409).json({ error: 'Das Feld ist schon belegt' });
    sheet[cat] = points(cat, state.dice);
    const players = JSON.parse(m.players);
    const finished = state.sheets.every((s) => CATEGORIES.every((c) => s[c] !== undefined));
    state.last = { player: state.current, category: cat, points: sheet[cat] };
    state.current = (state.current + 1) % players.length;
    state.dice = [0, 0, 0, 0, 0];
    state.held = [false, false, false, false, false];
    state.rolls = 0;
    save(m, state, finished ? 'finished' : 'active');
    if (finished) {
      const insert = db.prepare("INSERT INTO game_scores (family_id, user_id, game, score) VALUES (?, ?, 'kniffel', ?)");
      players.forEach((id, i) => insert.run(req.familyId, id, total(state.sheets[i])));
      const best = players.map((id, i) => ({ id, score: total(state.sheets[i]) })).sort((a, b) => b.score - a.score)[0];
      push?.notify?.(players.filter((id) => id !== req.user.id), {
        title: `🎲 Kniffel: ${nameOf(best.id)} gewinnt mit ${best.score} Punkten`,
        body: 'Das Spiel ist vorbei',
        path: `/spiele/kniffel/${m.id}`,
      });
    } else {
      push?.notify?.([players[state.current]], { title: '🎲 Du bist dran', body: `Kniffel – ${nameOf(req.user.id)} hat ${sheet[cat]} eingetragen`, path: `/spiele/kniffel/${m.id}` });
    }
    publish(req.familyId, 'games');
    res.json(reload(m.id));
  });

  // Spiel beenden (wer es gestartet hat)
  router.post(`${base}/:id/end`, auth, member, (req, res) => {
    const m = find(req);
    if (!m) return res.status(404).json({ error: 'Dieses Spiel gibt es nicht' });
    if (m.created_by !== req.user.id) return res.status(403).json({ error: 'Beenden kann, wer das Spiel gestartet hat' });
    db.prepare("UPDATE kniffel_matches SET status = 'cancelled', updated_at = datetime('now') WHERE id = ?").run(m.id);
    publish(req.familyId, 'games');
    res.json(reload(m.id));
  });

  return router;
}

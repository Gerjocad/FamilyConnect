// Spiele: Online-Partien zwischen zwei Familienmitgliedern (Tic-Tac-Toe, Vier gewinnt) und Bestenlisten (Memory).
// Der Server prüft jeden Zug, damit niemand schummeln kann; beide Handys bekommen Änderungen live.
import { Router } from 'express';

export const GAMES = {
  tictactoe: { name: 'Tic-Tac-Toe', emoji: '❌', rows: 3, cols: 3, connect: 3 },
  connect4: { name: 'Vier gewinnt', emoji: '🔴', rows: 6, cols: 7, connect: 4 },
};
const SCORE_GAMES = ['memory'];
// Wer gerade aktiv mitspielt, bekommt keine Nachricht pro Zug – erst nach so langer Pause wieder
const NUDGE_AFTER_MS = 60_000;

export const emptyBoard = (game) => Array.from({ length: GAMES[game].rows }, () => Array(GAMES[game].cols).fill(0));

/** Gewinner (1 oder 2), 'draw' bei vollem Brett, sonst null; dazu die Gewinnerfelder */
export function outcome(game, board) {
  const { rows, cols, connect } = GAMES[game];
  const dirs = [[0, 1], [1, 0], [1, 1], [1, -1]];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const p = board[r][c];
      if (!p) continue;
      for (const [dr, dc] of dirs) {
        const line = [[r, c]];
        for (let k = 1; k < connect; k++) {
          const rr = r + dr * k;
          const cc = c + dc * k;
          if (rr < 0 || rr >= rows || cc < 0 || cc >= cols || board[rr][cc] !== p) break;
          line.push([rr, cc]);
        }
        if (line.length === connect) return { winner: p, line };
      }
    }
  }
  return board.every((row) => row.every(Boolean)) ? { winner: 'draw', line: [] } : { winner: null, line: [] };
}

/** Zug anwenden: Tic-Tac-Toe { row, col }, Vier gewinnt { col } (fällt nach unten). Gibt neues Brett oder Fehler zurück */
export function applyMove(game, board, player, move) {
  const next = board.map((row) => [...row]);
  const { rows, cols } = GAMES[game];
  const col = Number(move?.col);
  if (!Number.isInteger(col) || col < 0 || col >= cols) return { error: 'Ungültiger Zug' };
  if (game === 'tictactoe') {
    const row = Number(move?.row);
    if (!Number.isInteger(row) || row < 0 || row >= rows) return { error: 'Ungültiger Zug' };
    if (next[row][col]) return { error: 'Das Feld ist schon belegt' };
    next[row][col] = player;
    return { board: next, cell: [row, col] };
  }
  for (let r = rows - 1; r >= 0; r--) {
    if (!next[r][col]) {
      next[r][col] = player;
      return { board: next, cell: [r, col] };
    }
  }
  return { error: 'Diese Spalte ist voll' };
}

export function gamesRouter(db, { auth, member, publish, push }) {
  const router = Router();
  const base = '/api/families/:familyId/games';
  const nameOf = (userId) => db.prepare('SELECT name FROM users WHERE id = ?').get(userId)?.name.split(' ')[0] ?? '';
  const serialize = (m) => ({
    id: m.id,
    game: m.game,
    players: [m.player1, m.player2],
    board: JSON.parse(m.board),
    turn: m.turn,
    winner: m.winner === null ? null : m.winner === 0 ? 'draw' : m.winner,
    line: JSON.parse(m.line),
    last: JSON.parse(m.last_move),
    status: m.status,
    created_at: m.created_at,
    updated_at: m.updated_at,
  });
  const find = (req) => db.prepare('SELECT * FROM game_matches WHERE family_id = ? AND id = ?').get(req.familyId, Number(req.params.id));
  const mine = (m, userId) => m && (m.player1 === userId || m.player2 === userId);

  // Meine Partien (laufende zuerst)
  router.get(`${base}/matches`, auth, member, (req, res) => {
    const rows = db.prepare(
      `SELECT * FROM game_matches WHERE family_id = ? AND (player1 = ? OR player2 = ?)
       ORDER BY status = 'active' DESC, updated_at DESC LIMIT 30`
    ).all(req.familyId, req.user.id, req.user.id);
    res.json(rows.map(serialize));
  });

  router.get(`${base}/matches/:id`, auth, member, (req, res) => {
    const m = find(req);
    if (!mine(m, req.user.id)) return res.status(404).json({ error: 'Diese Partie gibt es nicht' });
    res.json(serialize(m));
  });

  // Herausfordern: wer herausfordert, beginnt
  router.post(`${base}/matches`, auth, member, (req, res) => {
    const game = req.body?.game;
    const opponent = Number(req.body?.opponent);
    if (!GAMES[game]) return res.status(400).json({ error: 'Unbekanntes Spiel' });
    if (opponent === req.user.id || !db.prepare('SELECT 1 FROM memberships WHERE family_id = ? AND user_id = ?').get(req.familyId, opponent)) {
      return res.status(400).json({ error: 'Gegen wen?' });
    }
    const { lastInsertRowid } = db.prepare(
      `INSERT INTO game_matches (family_id, game, player1, player2, board, turn) VALUES (?, ?, ?, ?, ?, 1)`
    ).run(req.familyId, game, req.user.id, opponent, JSON.stringify(emptyBoard(game)));
    push?.notify?.([opponent], {
      title: `${GAMES[game].emoji} ${nameOf(req.user.id)} fordert dich heraus`,
      body: `${GAMES[game].name} – ${nameOf(req.user.id)} fängt an`,
      path: `/spiele/${game}/${lastInsertRowid}`,
    });
    publish(req.familyId, 'games');
    res.status(201).json(serialize(db.prepare('SELECT * FROM game_matches WHERE id = ?').get(lastInsertRowid)));
  });

  router.post(`${base}/matches/:id/move`, auth, member, (req, res) => {
    const m = find(req);
    if (!mine(m, req.user.id)) return res.status(404).json({ error: 'Diese Partie gibt es nicht' });
    if (m.status !== 'active') return res.status(409).json({ error: 'Die Partie ist schon vorbei' });
    const player = m.player1 === req.user.id ? 1 : 2;
    if (m.turn !== player) return res.status(409).json({ error: 'Du bist nicht dran' });
    const result = applyMove(m.game, JSON.parse(m.board), player, req.body);
    if (result.error) return res.status(400).json({ error: result.error });
    const { winner, line } = outcome(m.game, result.board);
    const finished = winner !== null;
    db.prepare(
      `UPDATE game_matches SET board = ?, turn = ?, winner = ?, line = ?, last_move = ?, status = ?, updated_at = datetime('now') WHERE id = ?`
    ).run(JSON.stringify(result.board), player === 1 ? 2 : 1, finished ? (winner === 'draw' ? 0 : winner) : null,
      JSON.stringify(line), JSON.stringify(result.cell), finished ? 'finished' : 'active', m.id);
    const other = player === 1 ? m.player2 : m.player1;
    const idle = Date.now() - new Date(`${m.updated_at.replace(' ', 'T')}Z`).getTime() > NUDGE_AFTER_MS;
    const g = GAMES[m.game];
    if (finished) {
      push?.notify?.([other], {
        title: `${g.emoji} ${g.name}: ${winner === 'draw' ? 'Unentschieden' : `${nameOf(req.user.id)} hat gewonnen`}`,
        body: winner === 'draw' ? 'Revanche?' : 'Revanche? 😉',
        path: `/spiele/${m.game}/${m.id}`,
      });
    } else if (idle) {
      push?.notify?.([other], { title: `${g.emoji} Du bist dran`, body: `${g.name} gegen ${nameOf(req.user.id)}`, path: `/spiele/${m.game}/${m.id}` });
    }
    publish(req.familyId, 'games');
    res.json(serialize(db.prepare('SELECT * FROM game_matches WHERE id = ?').get(m.id)));
  });

  // Aufgeben bzw. Partie beenden – zählt als Sieg für die andere Seite
  router.post(`${base}/matches/:id/resign`, auth, member, (req, res) => {
    const m = find(req);
    if (!mine(m, req.user.id)) return res.status(404).json({ error: 'Diese Partie gibt es nicht' });
    if (m.status !== 'active') return res.status(409).json({ error: 'Die Partie ist schon vorbei' });
    const winner = m.player1 === req.user.id ? 2 : 1;
    db.prepare("UPDATE game_matches SET status = 'finished', winner = ?, resigned = 1, updated_at = datetime('now') WHERE id = ?").run(winner, m.id);
    publish(req.familyId, 'games');
    res.json(serialize(db.prepare('SELECT * FROM game_matches WHERE id = ?').get(m.id)));
  });

  // Bilanz: Siege/Niederlagen/Unentschieden je Gegner
  router.get(`${base}/stats`, auth, member, (req, res) => {
    const rows = db.prepare("SELECT * FROM game_matches WHERE family_id = ? AND status = 'finished' AND (player1 = ? OR player2 = ?)")
      .all(req.familyId, req.user.id, req.user.id);
    const stats = {};
    for (const m of rows) {
      const me = m.player1 === req.user.id ? 1 : 2;
      const key = `${m.game}:${me === 1 ? m.player2 : m.player1}`;
      const s = (stats[key] ??= { game: m.game, opponent: me === 1 ? m.player2 : m.player1, won: 0, lost: 0, draw: 0 });
      if (m.winner === 0) s.draw++;
      else if (m.winner === me) s.won++;
      else s.lost++;
    }
    res.json(Object.values(stats));
  });

  // --- Bestenlisten (Memory: weniger Züge = besser) ---------------------------------------------
  router.post(`${base}/scores`, auth, member, (req, res) => {
    const { game, score, seconds } = req.body ?? {};
    if (!SCORE_GAMES.includes(game) || !Number.isInteger(score) || score < 1 || score > 10_000) return res.status(400).json({ error: 'Ungültiges Ergebnis' });
    const time = Number.isInteger(seconds) && seconds >= 0 && seconds < 100_000 ? seconds : null;
    db.prepare('INSERT INTO game_scores (family_id, user_id, game, score, seconds) VALUES (?, ?, ?, ?, ?)').run(req.familyId, req.user.id, game, score, time);
    publish(req.familyId, 'games');
    res.status(201).end();
  });

  router.get(`${base}/scores/:game`, auth, member, (req, res) => {
    if (!SCORE_GAMES.includes(req.params.game)) return res.status(404).json({ error: 'Unbekanntes Spiel' });
    // bestes Ergebnis je Person (wenigste Züge, dann schnellste Zeit)
    const rows = db.prepare(
      `SELECT user_id, score, seconds, created_at FROM game_scores s WHERE family_id = ? AND game = ? AND id = (
         SELECT id FROM game_scores t WHERE t.family_id = s.family_id AND t.game = s.game AND t.user_id = s.user_id
         ORDER BY score ASC, COALESCE(seconds, 1e9) ASC, id ASC LIMIT 1)
       ORDER BY score ASC, COALESCE(seconds, 1e9) ASC`
    ).all(req.familyId, req.params.game);
    res.json(rows);
  });

  return router;
}

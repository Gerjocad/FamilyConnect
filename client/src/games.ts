// Spiele (Server für Online-Partien: server/src/games.js – gleiche Regeln)
import { useCallback, useEffect, useState } from 'react';
import { api } from './api';
import { onLiveChange } from './live';
import { useFamily } from './session';

export type BoardGame = 'tictactoe' | 'connect4';
export type Cell = 0 | 1 | 2;
export type Board = Cell[][];

export const BOARD_GAMES: Record<BoardGame, { name: string; emoji: string; rows: number; cols: number; connect: number }> = {
  tictactoe: { name: 'Tic-Tac-Toe', emoji: '❌', rows: 3, cols: 3, connect: 3 },
  connect4: { name: 'Vier gewinnt', emoji: '🔴', rows: 6, cols: 7, connect: 4 },
};

export interface Match {
  id: number;
  game: BoardGame;
  players: [number, number];
  board: Board;
  turn: 1 | 2;
  winner: 1 | 2 | 'draw' | null;
  line: [number, number][];
  last: [number, number] | null;
  status: 'active' | 'finished';
  created_at: string;
  updated_at: string;
}

export const emptyBoard = (game: BoardGame): Board =>
  Array.from({ length: BOARD_GAMES[game].rows }, () => Array<Cell>(BOARD_GAMES[game].cols).fill(0));

export function outcome(game: BoardGame, board: Board): { winner: 1 | 2 | 'draw' | null; line: [number, number][] } {
  const { rows, cols, connect } = BOARD_GAMES[game];
  const dirs = [[0, 1], [1, 0], [1, 1], [1, -1]];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const p = board[r][c];
      if (!p) continue;
      for (const [dr, dc] of dirs) {
        const line: [number, number][] = [[r, c]];
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
  return { winner: board.every((row) => row.every(Boolean)) ? 'draw' : null, line: [] };
}

/** Tic-Tac-Toe: { row, col }; Vier gewinnt: { col } – der Stein fällt nach unten */
export function applyMove(game: BoardGame, board: Board, player: 1 | 2, move: { row?: number; col: number }) {
  const next = board.map((row) => [...row]) as Board;
  if (game === 'tictactoe') {
    if (next[move.row!][move.col]) return null;
    next[move.row!][move.col] = player;
    return { board: next, cell: [move.row!, move.col] as [number, number] };
  }
  for (let r = next.length - 1; r >= 0; r--) {
    if (!next[r][move.col]) {
      next[r][move.col] = player;
      return { board: next, cell: [r, move.col] as [number, number] };
    }
  }
  return null;
}

const movesOf = (game: BoardGame, board: Board) => {
  if (game === 'tictactoe') return board.flatMap((row, r) => row.map((v, c) => (v ? null : { row: r, col: c }))).filter(Boolean) as { row: number; col: number }[];
  return board[0].map((v, c) => (v ? null : { col: c })).filter(Boolean) as { col: number }[];
};
const pick = <T,>(list: T[]) => list[Math.floor(Math.random() * list.length)];

/** Tic-Tac-Toe perfekt (Minimax); „leicht“ spielt öfter zufällig */
function tttBest(board: Board, me: 1 | 2): { row: number; col: number } {
  const other = me === 1 ? 2 : 1;
  const score = (b: Board, turn: 1 | 2, depth: number): number => {
    const { winner } = outcome('tictactoe', b);
    if (winner === me) return 10 - depth;
    if (winner === other) return depth - 10;
    if (winner === 'draw') return 0;
    const values = movesOf('tictactoe', b).map((m) => score(applyMove('tictactoe', b, turn, m)!.board, turn === 1 ? 2 : 1, depth + 1));
    return turn === me ? Math.max(...values) : Math.min(...values);
  };
  const options = movesOf('tictactoe', board).map((m) => ({ m, s: score(applyMove('tictactoe', board, me, m)!.board, other, 1) }));
  const best = Math.max(...options.map((o) => o.s));
  return pick(options.filter((o) => o.s === best)).m as { row: number; col: number };
}

/** Vier gewinnt: gewinnen, sonst blocken, keine Vorlage geben, lieber in die Mitte */
function c4Best(board: Board, me: 1 | 2): { col: number } {
  const other = me === 1 ? 2 : 1;
  const moves = movesOf('connect4', board);
  const wins = (b: Board, p: 1 | 2, m: { col: number }) => outcome('connect4', applyMove('connect4', b, p, m)!.board).winner === p;
  const win = moves.find((m) => wins(board, me, m));
  if (win) return win;
  const block = moves.find((m) => wins(board, other, m));
  if (block) return block;
  const safe = moves.filter((m) => {
    const after = applyMove('connect4', board, me, m)!.board;
    return !movesOf('connect4', after).some((n) => wins(after, other, n));
  });
  const pool = safe.length ? safe : moves;
  const weight = (m: { col: number }) => 4 - Math.abs(3 - m.col) + Math.random() * 1.5;
  return pool.sort((a, b) => weight(b) - weight(a))[0];
}

export function computerMove(game: BoardGame, board: Board, me: 1 | 2, level: 'leicht' | 'schwer') {
  const moves = movesOf(game, board);
  if (level === 'leicht' && Math.random() < 0.45) return pick(moves);
  return game === 'tictactoe' ? tttBest(board, me) : c4Best(board, me);
}

/** Meine Online-Partien, live aktualisiert */
export function useMatches() {
  const { family } = useFamily();
  const base = `/families/${family.id}/games`;
  const [matches, setMatches] = useState<Match[] | null>(null);
  const reload = useCallback(async () => setMatches(await api<Match[]>(`${base}/matches`)), [base]);
  useEffect(() => {
    void reload().catch(() => setMatches([]));
    return onLiveChange((resource) => resource === 'games' && void reload().catch(() => undefined));
  }, [reload]);
  return { matches, reload, base };
}

// --- Wörter raten -----------------------------------------------------------------------------
export const WORDS = [
  'APFEL', 'BANANE', 'ERDBEERE', 'KARTOFFEL', 'SCHOKOLADE', 'PIZZA', 'NUDELN', 'BROTDOSE', 'KUCHEN', 'GURKE',
  'ELEFANT', 'GIRAFFE', 'KROKODIL', 'PINGUIN', 'SCHMETTERLING', 'EICHHÖRNCHEN', 'DELFIN', 'KÄNGURU', 'PAPAGEI', 'SCHILDKRÖTE',
  'FUSSBALL', 'TRAMPOLIN', 'SCHAUKEL', 'RUTSCHE', 'FAHRRAD', 'ROLLER', 'DRACHEN', 'SANDBURG', 'SCHWIMMBAD', 'ZELTLAGER',
  'SCHULE', 'RUCKSACK', 'FEDERMAPPE', 'TAFEL', 'LEHRERIN', 'HAUSAUFGABE', 'PAUSE', 'ZEUGNIS', 'BUNTSTIFT', 'RADIERGUMMI',
  'GEBURTSTAG', 'GESCHENK', 'LUFTBALLON', 'KERZE', 'WEIHNACHTEN', 'OSTERHASE', 'FERIEN', 'URLAUB', 'KOFFER', 'FLUGZEUG',
  'REGENBOGEN', 'GEWITTER', 'SCHNEEMANN', 'SONNENSCHEIN', 'WOLKE', 'MOND', 'STERNE', 'RAKETE', 'ASTRONAUT', 'PLANET',
  'FEUERWEHR', 'POLIZEI', 'BAGGER', 'TRAKTOR', 'EISENBAHN', 'HUBSCHRAUBER', 'SEGELBOOT', 'U-BAHN', 'AMPEL', 'BRÜCKE',
  'ZAUBERER', 'PRINZESSIN', 'RITTERBURG', 'SCHATZKISTE', 'PIRATENSCHIFF', 'DINOSAURIER', 'EINHORN', 'DRACHENEI', 'MONSTER', 'ROBOTER',
  'KUSCHELTIER', 'TEDDYBÄR', 'PUZZLE', 'MURMELN', 'BAUKLÖTZE', 'KNETE', 'SEIFENBLASEN', 'HÜPFBURG', 'VERSTECKEN', 'KITZELN',
  'ISTANBUL', 'FENERBAHCE', 'GALATASARAY', 'DÖNER', 'BAKLAVA', 'SIMIT', 'OMA', 'OPA', 'FAMILIE', 'KUSCHELN',
];
export const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÜ'.split('');

// --- Memory -----------------------------------------------------------------------------------
export const MEMORY_THEMES: Record<string, string[]> = {
  Tiere: ['🐶', '🐱', '🦊', '🐼', '🐸', '🐵', '🦁', '🐧', '🐙', '🦄'],
  Essen: ['🍕', '🍔', '🍦', '🍩', '🍓', '🍉', '🥨', '🌭', '🍪', '🧁'],
  Sport: ['⚽', '🏀', '🎾', '🏐', '🏎️', '🚴', '🏊', '⛷️', '🥋', '🏓'],
};

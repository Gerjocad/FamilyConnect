import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { api } from '../api';
import { Avatar } from '../components/Avatar';
import { useAsync } from '../components/useAsync';
import {
  BOARD_GAMES, applyMove, computerMove, emptyBoard, outcome,
  type Board, type BoardGame, type Match,
} from '../games';
import { onLiveChange } from '../live';
import { useFamily } from '../session';

interface View {
  board: Board;
  turn: 1 | 2;
  winner: 1 | 2 | 'draw' | null;
  line: [number, number][];
  last: [number, number] | null;
}

/** Tic-Tac-Toe und Vier gewinnt: zu zweit hier, gegen den Computer oder online (/spiele/:game/:matchId) */
export function BoardGamePage() {
  const { game, matchId } = useParams() as { game: BoardGame; matchId?: string };
  if (!BOARD_GAMES[game]) return <div className="page"><p>Unbekanntes Spiel. <Link to="/spiele">Zu den Spielen</Link></p></div>;
  return matchId ? <OnlineGame key={matchId} game={game} matchId={Number(matchId)} /> : <LocalGame game={game} />;
}

function LocalGame({ game }: { game: BoardGame }) {
  const [params] = useSearchParams();
  const vsComputer = params.get('modus') === 'computer';
  const level = params.get('stufe') === 'schwer' ? 'schwer' : 'leicht';
  const fresh = (): View => ({ board: emptyBoard(game), turn: 1, winner: null, line: [], last: null });
  const [view, setView] = useState<View>(fresh);
  // abwechselnd anfangen
  const [starter, setStarter] = useState<1 | 2>(1);
  const [score, setScore] = useState({ 1: 0, 2: 0, draw: 0 });

  const play = useCallback((v: View, move: { row?: number; col: number }): View => {
    const result = applyMove(game, v.board, v.turn, move);
    if (!result) return v;
    const { winner, line } = outcome(game, result.board);
    return { board: result.board, turn: v.turn === 1 ? 2 : 1, winner, line, last: result.cell };
  }, [game]);

  // Spielstand zählen, sobald eine Runde entschieden ist
  useEffect(() => {
    const w = view.winner;
    if (w) setScore((s) => ({ ...s, [w]: s[w] + 1 }));
  }, [view.winner]);

  // Computer ist Spieler 2
  useEffect(() => {
    if (!vsComputer || view.turn !== 2 || view.winner) return;
    const t = setTimeout(() => setView((v) => play(v, computerMove(game, v.board, 2, level))), 450);
    return () => clearTimeout(t);
  }, [view, vsComputer, level, game, play]);

  const names: Record<1 | 2, string> = vsComputer ? { 1: 'Du', 2: 'Computer' } : { 1: 'Spieler 1', 2: 'Spieler 2' };
  const canPlay = !view.winner && !(vsComputer && view.turn === 2);
  return (
    <GameScreen
      game={game}
      view={view}
      names={names}
      status={view.winner ? (view.winner === 'draw' ? 'Unentschieden!' : `${names[view.winner]} ${vsComputer && view.winner === 1 ? 'hast' : 'hat'} gewonnen! 🎉`) : `${names[view.turn]} ${vsComputer && view.turn === 1 ? 'bist' : 'ist'} dran`}
      onMove={(m) => canPlay && setView((v) => play(v, m))}
      footer={
        <>
          <p className="muted game-score">{names[1]} {score[1]} : {score[2]} {names[2]}{score.draw ? ` · ${score.draw}× unentschieden` : ''}</p>
          <button
            className="button primary"
            onClick={() => {
              const next = starter === 1 ? 2 : 1;
              setStarter(next);
              setView({ ...fresh(), turn: next });
            }}
          >
            Neue Runde
          </button>
        </>
      }
    />
  );
}

function OnlineGame({ game, matchId }: { game: BoardGame; matchId: number }) {
  const { family, user, member } = useFamily();
  const navigate = useNavigate();
  const url = `/families/${family.id}/games/matches/${matchId}`;
  const [match, setMatch] = useState<Match | null>(null);
  const { busy, error, run } = useAsync();
  const load = useCallback(() => api<Match>(url).then(setMatch), [url]);
  useEffect(() => {
    void run(load);
    return onLiveChange((resource) => resource === 'games' && void load().catch(() => undefined));
  }, [load]);

  if (!match) return <div className="page">{error ? <p className="error">{error}</p> : <p className="muted">Lade …</p>}</div>;
  const me: 1 | 2 = match.players[0] === user.id ? 1 : 2;
  const opponentId = match.players[me === 1 ? 1 : 0];
  const opponent = member(opponentId);
  const first = (id: number) => member(id)?.name.split(' ')[0] ?? '?';
  const names: Record<1 | 2, string> = { 1: first(match.players[0]), 2: first(match.players[1]) };
  const myTurn = match.status === 'active' && match.turn === me;
  const status = match.winner
    ? match.winner === 'draw' ? 'Unentschieden!' : match.winner === me ? 'Du hast gewonnen! 🎉' : `${first(opponentId)} hat gewonnen`
    : myTurn ? 'Du bist dran' : `${first(opponentId)} ist dran …`;

  return (
    <GameScreen
      game={game}
      view={match}
      names={names}
      me={me}
      players={match.players}
      status={status}
      onMove={(m) => myTurn && !busy && void run(async () => setMatch(await api<Match>(`${url}/move`, { method: 'POST', body: m })))}
      footer={
        <>
          {error && <p className="error">{error}</p>}
          {match.status === 'active' ? (
            <button className="link-button" disabled={busy} onClick={() => confirm('Aufgeben?') && void run(async () => setMatch(await api<Match>(`${url}/resign`, { method: 'POST' })))}>Aufgeben</button>
          ) : (
            opponent && (
              <button
                className="button primary"
                disabled={busy}
                onClick={() => void run(async () => {
                  const next = await api<Match>(`/families/${family.id}/games/matches`, { method: 'POST', body: { game, opponent: opponentId } });
                  navigate(`/spiele/${game}/${next.id}`);
                })}
              >
                Revanche
              </button>
            )
          )}
        </>
      }
    />
  );
}

/** Brett, Status und Spieler – gleich für alle Spielarten */
function GameScreen({ game, view, names, me, players, status, onMove, footer }: {
  game: BoardGame;
  view: View;
  names: Record<1 | 2, string>;
  me?: 1 | 2;
  players?: [number, number];
  status: string;
  onMove(move: { row?: number; col: number }): void;
  footer: React.ReactNode;
}) {
  const { member } = useFamily();
  const g = BOARD_GAMES[game];
  const inLine = (r: number, c: number) => view.line.some(([lr, lc]) => lr === r && lc === c);
  const isLast = (r: number, c: number) => view.last?.[0] === r && view.last?.[1] === c;
  const piece = (p: 1 | 2) => (game === 'tictactoe' ? (p === 1 ? '❌' : '⭕') : <span className={`disc disc-${p}`} />);

  return (
    <div className="page board-game">
      <header className="page-header">
        <h1>{g.emoji} {g.name}</h1>
        <Link to="/spiele" className="link-button">Alle Spiele</Link>
      </header>
      <div className="game-players">
        {([1, 2] as const).map((p) => {
          const m = players ? member(players[p - 1]) : undefined;
          return (
            <span key={p} className={`game-player ${!view.winner && view.turn === p ? 'active' : ''}`}>
              {m && <Avatar member={m} size={28} />}
              <span className="game-piece">{piece(p)}</span>
              <span>{names[p]}{me === p ? ' (du)' : ''}</span>
            </span>
          );
        })}
      </div>
      <p className={`game-status ${view.winner ? 'done' : ''}`}>{status}</p>
      <div className={`game-board ${game}`} style={{ gridTemplateColumns: `repeat(${g.cols}, 1fr)` }}>
        {view.board.map((row, r) => row.map((cell, c) => (
          <button
            key={`${r}-${c}`}
            type="button"
            className={`game-cell ${inLine(r, c) ? 'win' : ''} ${isLast(r, c) ? 'last' : ''}`}
            aria-label={`Zeile ${r + 1}, Spalte ${c + 1}${cell ? `: ${names[cell as 1 | 2]}` : ''}`}
            onClick={() => onMove(game === 'tictactoe' ? { row: r, col: c } : { col: c })}
            disabled={Boolean(view.winner)}
          >
            {cell ? piece(cell as 1 | 2) : null}
          </button>
        )))}
      </div>
      <div className="game-footer">{footer}</div>
    </div>
  );
}

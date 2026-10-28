import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { api } from '../api';
import { Avatar } from '../components/Avatar';
import { Modal } from '../components/Modal';
import { useAsync } from '../components/useAsync';
import { BOARD_GAMES, useMatches, type BoardGame, type Match } from '../games';
import { useFamily } from '../session';

/** Untermenü „Spiele“: Übersicht der Spiele und meiner laufenden Online-Partien */
export function GamesPage() {
  const { user, member } = useFamily();
  const { matches } = useMatches();
  const [starting, setStarting] = useState<BoardGame | null>(null);
  const active = (matches ?? []).filter((m) => m.status === 'active');
  const myTurn = (m: Match) => m.players[m.turn - 1] === user.id;
  const opponent = (m: Match) => member(m.players[0] === user.id ? m.players[1] : m.players[0]);

  return (
    <div className="page games-page">
      <header className="page-header"><h1>Spiele</h1></header>

      {active.length > 0 && (
        <section className="card">
          <h2>Laufende Partien</h2>
          <ul className="match-list">
            {active.sort((a, b) => Number(myTurn(b)) - Number(myTurn(a))).map((m) => {
              const o = opponent(m);
              return (
                <li key={m.id}>
                  <Link to={`/spiele/${m.game}/${m.id}`} className="match-row">
                    {o && <Avatar member={o} size={32} />}
                    <span className="match-main">
                      <strong>{BOARD_GAMES[m.game].emoji} {BOARD_GAMES[m.game].name}</strong>
                      <small className="muted">gegen {o?.name.split(' ')[0]}</small>
                    </span>
                    {myTurn(m) ? <span className="badge match-turn">Du bist dran</span> : <small className="muted">{o?.name.split(' ')[0]} ist dran</small>}
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <div className="game-tiles">
        <button type="button" className="card game-tile" onClick={() => setStarting('tictactoe')}>
          <span className="game-tile-emoji">❌⭕</span>
          <strong>Tic-Tac-Toe</strong>
          <small className="muted">Drei in einer Reihe</small>
        </button>
        <button type="button" className="card game-tile" onClick={() => setStarting('connect4')}>
          <span className="game-tile-emoji">🔴🟡</span>
          <strong>Vier gewinnt</strong>
          <small className="muted">Vier in einer Reihe – auch schräg</small>
        </button>
        <Link to="/spiele/memory" className="card game-tile">
          <span className="game-tile-emoji">🃏</span>
          <strong>Memory</strong>
          <small className="muted">Paare finden – mit Bestenliste</small>
        </Link>
        <Link to="/spiele/woerter" className="card game-tile">
          <span className="game-tile-emoji">🔤</span>
          <strong>Wörter raten</strong>
          <small className="muted">Buchstabe für Buchstabe</small>
        </Link>
      </div>

      {starting && <StartDialog game={starting} onClose={() => setStarting(null)} />}
    </div>
  );
}

/** Wie spielen? Zu zweit hier, gegen den Computer oder online gegen jemanden aus der Familie */
function StartDialog({ game, onClose }: { game: BoardGame; onClose(): void }) {
  const { family, user } = useFamily();
  const navigate = useNavigate();
  const { busy, error, run } = useAsync();
  const g = BOARD_GAMES[game];
  return (
    <Modal title={`${g.emoji} ${g.name}`} onClose={onClose}>
      <div className="form start-game">
        <button type="button" className="button big" onClick={() => navigate(`/spiele/${game}?modus=hier`)}>👥 Zu zweit auf diesem Handy</button>
        <h3>🤖 Gegen den Computer</h3>
        <div className="row">
          <button type="button" className="button big" onClick={() => navigate(`/spiele/${game}?modus=computer&stufe=leicht`)}>Leicht</button>
          <button type="button" className="button big" onClick={() => navigate(`/spiele/${game}?modus=computer&stufe=schwer`)}>Schwer</button>
        </div>
        <h3>📱 Online gegen …</h3>
        <p className="muted">Jeder spielt auf seinem Handy – du fängst an, die andere Person bekommt eine Nachricht.</p>
        <div className="locate-people">
          {family.members.filter((m) => m.id !== user.id).map((m) => (
            <button
              key={m.id}
              type="button"
              className="locate-person"
              disabled={busy}
              onClick={() => void run(async () => {
                const match = await api<Match>(`/families/${family.id}/games/matches`, { method: 'POST', body: { game, opponent: m.id } });
                navigate(`/spiele/${game}/${match.id}`);
              })}
            >
              <Avatar member={m} size={44} />
              <span>{m.name.split(' ')[0]}</span>
            </button>
          ))}
        </div>
        {error && <p className="error">{error}</p>}
      </div>
    </Modal>
  );
}

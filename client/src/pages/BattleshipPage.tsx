import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { api } from '../api';
import { Avatar } from '../components/Avatar';
import { useAsync } from '../components/useAsync';
import {
  FLEET, SHIP_NAMES, SIZE, cellsOf, computerShot, fire, isSunk, randomFleet, shipAt,
  type Ship, type Shot,
} from '../battleship';
import { onLiveChange } from '../live';
import { useFamily } from '../session';

interface OnlineView {
  myShips: Ship[];
  ready: { 1: boolean; 2: boolean };
  myShots: Shot[];
  theirShots: Shot[];
  revealed: Ship[];
}
interface OnlineMatch {
  id: number;
  players: [number, number];
  board: OnlineView;
  turn: 1 | 2;
  winner: 1 | 2 | null;
  status: 'setup' | 'active' | 'finished';
  shot?: { hit: boolean; sunk: number | null };
}

/** Schiffe versenken: gegen den Computer (/spiele/battleship) oder online (/spiele/battleship/:matchId) */
export function BattleshipPage() {
  const { matchId } = useParams();
  return matchId ? <Online key={matchId} matchId={Number(matchId)} /> : <VsComputer />;
}

// --- Spielfeld ----------------------------------------------------------------------------

const LETTERS = 'ABCDEFGHIJ';

/** Ein 10×10-Meer. Eigenes Meer: Schiffe sichtbar. Gegnerisches: nur Schüsse und versenkte Schiffe */
function Sea({ ships, shots, revealed = [], onShoot, small = false, label }: {
  ships?: Ship[];
  shots: Shot[];
  revealed?: Ship[];
  onShoot?(r: number, c: number): void;
  small?: boolean;
  label: string;
}) {
  const shotAt = (r: number, c: number) => shots.find(([sr, sc]) => sr === r && sc === c);
  const sunkCell = (r: number, c: number) => revealed.some((s) => cellsOf(s).some(([sr, sc]) => sr === r && sc === c));
  const last = shots.at(-1);
  return (
    <div className={`sea ${small ? 'small' : ''}`} role="grid" aria-label={label}>
      <span />
      {Array.from({ length: SIZE }, (_, c) => <span key={c} className="sea-label">{c + 1}</span>)}
      {Array.from({ length: SIZE }, (_, r) => (
        <div key={r} className="sea-row" role="row">
          <span className="sea-label">{LETTERS[r]}</span>
          {Array.from({ length: SIZE }, (_, c) => {
            const s = shotAt(r, c);
            const ship = ships ? shipAt(ships, r, c) : undefined;
            const sunk = sunkCell(r, c) || (ship && isSunk(ship, shots));
            const cls = ['sea-cell', ship && 'ship', sunk && 'sunk', s && (s[2] ? 'hit' : 'miss'), last && last[0] === r && last[1] === c && 'last'].filter(Boolean).join(' ');
            return (
              <button
                key={c}
                type="button"
                role="gridcell"
                className={cls}
                disabled={!onShoot || Boolean(s)}
                onClick={() => onShoot?.(r, c)}
                aria-label={`${LETTERS[r]}${c + 1}${s ? (s[2] ? ' Treffer' : ' Wasser') : ''}`}
              >
                {s ? (s[2] ? (sunk ? '✖' : '🔥') : '•') : ''}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

/** Welche Schiffe des Gegners sind noch übrig? */
function FleetStatus({ sunk }: { sunk: Ship[] }) {
  const gone = sunk.map((s) => s.len);
  return (
    <span className="fleet-status" aria-label="Schiffe des Gegners">
      {FLEET.map((len, i) => {
        const at = gone.indexOf(len);
        if (at >= 0) gone.splice(at, 1);
        return <span key={i} className={at >= 0 ? 'gone' : ''} title={SHIP_NAMES[len]}>{'■'.repeat(len)}</span>;
      })}
    </span>
  );
}

function Setup({ ships, onShuffle, onDone, busy }: { ships: Ship[]; onShuffle(): void; onDone(): void; busy?: boolean }) {
  return (
    <section className="card battleship-setup">
      <h2>Deine Flotte aufstellen</h2>
      <p className="muted">Schiffe dürfen sich nicht berühren. „Neu verteilen“, bis es dir gefällt.</p>
      <Sea ships={ships} shots={[]} label="Deine Flotte" />
      <div className="row wrap game-footer">
        <button className="button" disabled={busy} onClick={onShuffle}>🔀 Neu verteilen</button>
        <button className="button primary" disabled={busy} onClick={onDone}>✅ Fertig</button>
      </div>
    </section>
  );
}

// --- Gegen den Computer ----------------------------------------------------------------------

function VsComputer() {
  const [myShips, setMyShips] = useState(randomFleet);
  const [compShips, setCompShips] = useState(randomFleet);
  const [started, setStarted] = useState(false);
  const [myShots, setMyShots] = useState<Shot[]>([]);
  const [compShots, setCompShots] = useState<Shot[]>([]);
  const [turn, setTurn] = useState<'me' | 'comp'>('me');
  const [message, setMessage] = useState('Du fängst an – tipp aufs gegnerische Meer');
  const iWon = compShips.every((s) => isSunk(s, myShots));
  const compWon = myShips.every((s) => isSunk(s, compShots));
  const over = iWon || compWon;

  const restart = () => {
    setMyShips(randomFleet());
    setCompShips(randomFleet());
    setMyShots([]);
    setCompShots([]);
    setTurn('me');
    setStarted(false);
    setMessage('Du fängst an – tipp aufs gegnerische Meer');
  };

  const shoot = (r: number, c: number) => {
    if (turn !== 'me' || over) return;
    const res = fire(compShips, myShots, r, c);
    setMyShots(res.shots);
    if (res.allSunk) setMessage('Gewonnen! Alle Schiffe versenkt 🎉');
    else if (res.sunk) setMessage(`Versenkt: ${SHIP_NAMES[res.sunk.len]}! Nochmal`);
    else if (res.hit) setMessage('Treffer! 🔥 Nochmal');
    else {
      setMessage('Wasser – der Computer ist dran …');
      setTurn('comp');
    }
  };

  // Computer schießt (bei Treffer weiter)
  useEffect(() => {
    if (!started || turn !== 'comp' || over) return;
    const t = setTimeout(() => {
      const sunk = myShips.filter((s) => isSunk(s, compShots));
      const [r, c] = computerShot(compShots, sunk);
      const res = fire(myShips, compShots, r, c);
      setCompShots(res.shots);
      if (res.allSunk) setMessage('Der Computer hat gewonnen 😅');
      else if (res.hit) setMessage(res.sunk ? `Der Computer hat dein ${SHIP_NAMES[res.sunk.len]} versenkt …` : 'Der Computer hat getroffen …');
      else {
        setMessage('Du bist dran');
        setTurn('me');
      }
    }, 700);
    return () => clearTimeout(t);
  }, [turn, compShots, started, over, myShips]);

  return (
    <div className="page battleship">
      <header className="page-header"><h1>🚢 Schiffe versenken</h1><Link to="/spiele" className="link-button">Alle Spiele</Link></header>
      {!started ? (
        <Setup ships={myShips} onShuffle={() => setMyShips(randomFleet())} onDone={() => setStarted(true)} />
      ) : (
        <>
          <p className={`game-status ${over ? 'done' : ''}`}>{message}</p>
          <h3 className="sea-title">Gegner (Computer) <FleetStatus sunk={compShips.filter((s) => isSunk(s, myShots))} /></h3>
          <Sea shots={myShots} revealed={over ? compShips : compShips.filter((s) => isSunk(s, myShots))} onShoot={turn === 'me' && !over ? shoot : undefined} label="Meer des Computers" />
          <h3 className="sea-title">Deine Flotte</h3>
          <Sea ships={myShips} shots={compShots} small label="Deine Flotte" />
          {over && <div className="game-footer"><button className="button primary" onClick={restart}>Neues Spiel</button></div>}
        </>
      )}
    </div>
  );
}

// --- Online --------------------------------------------------------------------------------

function Online({ matchId }: { matchId: number }) {
  const { family, user, member } = useFamily();
  const navigate = useNavigate();
  const url = `/families/${family.id}/games/matches/${matchId}`;
  const [match, setMatch] = useState<OnlineMatch | null>(null);
  const [draft, setDraft] = useState(randomFleet);
  const [note, setNote] = useState('');
  const { busy, error, run } = useAsync();
  const load = useCallback(() => api<OnlineMatch>(url).then(setMatch), [url]);
  useEffect(() => {
    void run(load);
    return onLiveChange((resource) => resource === 'games' && void load().catch(() => undefined));
  }, [load]);

  if (!match) return <div className="page">{error ? <p className="error">{error}</p> : <p className="muted">Lade …</p>}</div>;
  const me: 1 | 2 = match.players[0] === user.id ? 1 : 2;
  const opponentId = match.players[me === 1 ? 1 : 0];
  const opp = member(opponentId);
  const oppName = opp?.name.split(' ')[0] ?? 'Gegner';
  const v = match.board;
  const myTurn = match.status === 'active' && match.turn === me;

  const header = (
    <header className="page-header"><h1>🚢 Schiffe versenken</h1><Link to="/spiele" className="link-button">Alle Spiele</Link></header>
  );
  if (match.status === 'setup' && !v.ready[me]) {
    return (
      <div className="page battleship">
        {header}
        <p className="muted">gegen {oppName} {v.ready[me === 1 ? 2 : 1] ? '– steht schon bereit' : ''}</p>
        <Setup
          ships={draft}
          busy={busy}
          onShuffle={() => setDraft(randomFleet())}
          onDone={() => void run(async () => setMatch(await api<OnlineMatch>(`${url}/ships`, { method: 'POST', body: { ships: draft } })))}
        />
        {error && <p className="error">{error}</p>}
      </div>
    );
  }

  const status = match.status === 'setup'
    ? `Warte, bis ${oppName} die Schiffe aufgestellt hat …`
    : match.winner
      ? match.winner === me ? 'Gewonnen! Alle Schiffe versenkt 🎉' : `${oppName} hat gewonnen`
      : myTurn ? note || 'Du bist dran – tipp aufs gegnerische Meer' : `${oppName} ist dran …`;

  return (
    <div className="page battleship">
      {header}
      <div className="game-players">
        <span className={`game-player ${myTurn ? 'active' : ''}`}>{member(user.id) && <Avatar member={member(user.id)!} size={26} />} Du</span>
        <span className={`game-player ${match.status === 'active' && !myTurn ? 'active' : ''}`}>{opp && <Avatar member={opp} size={26} />} {oppName}</span>
      </div>
      <p className={`game-status ${match.winner ? 'done' : ''}`}>{status}</p>
      <h3 className="sea-title">{oppName}s Meer <FleetStatus sunk={v.revealed.filter((s) => isSunk(s, v.myShots))} /></h3>
      <Sea
        shots={v.myShots}
        revealed={v.revealed}
        label={`Meer von ${oppName}`}
        onShoot={myTurn && !busy ? (r, c) => void run(async () => {
          const next = await api<OnlineMatch>(`${url}/move`, { method: 'POST', body: { row: r, col: c } });
          setNote(next.shot?.sunk ? `Versenkt: ${SHIP_NAMES[next.shot.sunk]}! Nochmal` : next.shot?.hit ? 'Treffer! 🔥 Nochmal' : '');
          setMatch(next);
        }) : undefined}
      />
      <h3 className="sea-title">Deine Flotte</h3>
      <Sea ships={v.myShips} shots={v.theirShots} small label="Deine Flotte" />
      {error && <p className="error">{error}</p>}
      <div className="game-footer">
        {match.status === 'finished' ? (
          <button className="button primary" disabled={busy} onClick={() => void run(async () => {
            const next = await api<OnlineMatch>(`/families/${family.id}/games/matches`, { method: 'POST', body: { game: 'battleship', opponent: opponentId } });
            navigate(`/spiele/battleship/${next.id}`);
          })}>Revanche</button>
        ) : (
          <button className="link-button" disabled={busy} onClick={() => confirm('Aufgeben?') && void run(async () => setMatch(await api<OnlineMatch>(`${url}/resign`, { method: 'POST' })))}>Aufgeben</button>
        )}
      </div>
    </div>
  );
}

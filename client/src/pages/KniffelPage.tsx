import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { api } from '../api';
import { Avatar } from '../components/Avatar';
import { useAsync } from '../components/useAsync';
import { onLiveChange } from '../live';
import { useFamily } from '../session';

// --- Regeln ------------------------------------------------------------------------------------
type Category = 'ones' | 'twos' | 'threes' | 'fours' | 'fives' | 'sixes' | 'three' | 'four' | 'full' | 'small' | 'large' | 'kniffel' | 'chance';
const UPPER: [Category, string, number][] = [['ones', 'Einser', 1], ['twos', 'Zweier', 2], ['threes', 'Dreier', 3], ['fours', 'Vierer', 4], ['fives', 'Fünfer', 5], ['sixes', 'Sechser', 6]];
const LOWER: [Category, string][] = [['three', 'Dreierpasch'], ['four', 'Viererpasch'], ['full', 'Full House'], ['small', 'Kleine Straße'], ['large', 'Große Straße'], ['kniffel', 'Kniffel'], ['chance', 'Chance']];
const CATEGORIES = [...UPPER.map(([c]) => c), ...LOWER.map(([c]) => c)];
const BONUS_AT = 63;
const BONUS = 35;
const FACES = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

/** Punkte, die diese Würfel in der Kategorie bringen würden */
export function points(cat: Category, dice: number[]) {
  const counts = [0, 0, 0, 0, 0, 0, 0];
  for (const d of dice) counts[d]++;
  const sum = dice.reduce((a, b) => a + b, 0);
  const max = Math.max(...counts);
  const has = (run: number[]) => run.every((n) => counts[n] > 0);
  const upper = UPPER.find(([c]) => c === cat);
  if (upper) return counts[upper[2]] * upper[2];
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

type Sheet = Partial<Record<Category, number>>;
const upperSum = (s: Sheet) => UPPER.reduce((a, [c]) => a + (s[c] ?? 0), 0);
const bonus = (s: Sheet) => (upperSum(s) >= BONUS_AT ? BONUS : 0);
const total = (s: Sheet) => CATEGORIES.reduce((a, c) => a + (s[c] ?? 0), 0) + bonus(s);

interface Player { name: string; userId: number | null }
interface Best { user_id: number; score: number }
interface OnlineGame {
  id: number;
  players: number[];
  sheets: Sheet[];
  current: number;
  dice: number[];
  held: boolean[];
  rolls: number;
  last?: { player: number; category: Category; points: number };
  status: 'active' | 'finished' | 'cancelled';
  created_by: number;
}
const LABEL: Record<Category, string> = Object.fromEntries([...UPPER.map(([c, l]) => [c, l]), ...LOWER]) as Record<Category, string>;

/** Kniffel: reihum auf einem Handy (/spiele/kniffel) oder online mit Eingeladenen (/spiele/kniffel/:id) */
export function KniffelPage() {
  const { matchId } = useParams();
  const [players, setPlayers] = useState<Player[] | null>(null);
  if (matchId) return <Online key={matchId} id={Number(matchId)} />;
  return players ? <Local players={players} onEnd={() => setPlayers(null)} /> : <SetupPlayers onStart={setPlayers} />;
}

function SetupPlayers({ onStart }: { onStart(p: Player[]): void }) {
  const { family, user, member } = useFamily();
  const navigate = useNavigate();
  const [mode, setMode] = useState<'hier' | 'online'>('hier');
  const [chosen, setChosen] = useState<Player[]>([{ name: member(user.id)?.name.split(' ')[0] ?? 'Ich', userId: user.id }]);
  const [guest, setGuest] = useState('');
  const best = useBest();
  const { busy, error, run } = useAsync();
  const others = family.members.filter((m) => m.id !== user.id);
  // online: nur Familienmitglieder (Gäste haben kein eigenes Handy in der App)
  const invited = chosen.filter((p) => p.userId !== null && p.userId !== user.id);
  const toggle = (id: number, name: string) =>
    setChosen((c) => (c.some((p) => p.userId === id) ? c.filter((p) => p.userId !== id) : c.length < 6 ? [...c, { name, userId: id }] : c));
  return (
    <div className="page kniffel">
      <header className="page-header"><h1>🎲 Kniffel</h1><Link to="/spiele" className="link-button">Alle Spiele</Link></header>
      <section className="card form">
        <div className="segmented" role="tablist">
          <button type="button" role="tab" aria-selected={mode === 'hier'} className={mode === 'hier' ? 'active' : ''} onClick={() => setMode('hier')}>👥 Hier reihum</button>
          <button type="button" role="tab" aria-selected={mode === 'online'} className={mode === 'online' ? 'active' : ''} onClick={() => setMode('online')}>📱 Online einladen</button>
        </div>
        <h2>Wer spielt mit?</h2>
        <p className="muted">
          {mode === 'hier'
            ? 'Reihum auf diesem Handy – bis zu 6 Spieler, auch Gäste.'
            : 'Jeder spielt auf seinem Handy und sieht live, was die anderen würfeln. Die Eingeladenen bekommen eine Nachricht. Du fängst an.'}
        </p>
        <div className="locate-people">
          {(mode === 'hier' ? family.members : others).map((m) => (
            <button key={m.id} type="button" className={`locate-person ${chosen.some((p) => p.userId === m.id) ? 'picked' : ''}`} onClick={() => toggle(m.id, m.name.split(' ')[0])}>
              <Avatar member={m} size={40} />
              <span>{m.name.split(' ')[0]}</span>
            </button>
          ))}
        </div>
        {mode === 'hier' && (
          <div className="row">
            <input value={guest} onChange={(e) => setGuest(e.target.value)} placeholder="Gast (z. B. Oma)" maxLength={20} aria-label="Gast" />
            <button className="button" disabled={!guest.trim() || chosen.length >= 6} onClick={() => { setChosen([...chosen, { name: guest.trim(), userId: null }]); setGuest(''); }}>+ Gast</button>
          </div>
        )}
        {mode === 'hier' ? (
          <>
            <p className="kniffel-order">{chosen.map((p, i) => <span key={`${p.name}-${i}`} className="chip">{i + 1}. {p.name}</span>)}</p>
            <button className="button primary big" disabled={chosen.length === 0} onClick={() => onStart(chosen)}>Los geht's ({chosen.length} {chosen.length === 1 ? 'Spieler' : 'Spieler'})</button>
          </>
        ) : (
          <>
            <p className="kniffel-order">
              <span className="chip">1. Du</span>
              {invited.map((p, i) => <span key={p.userId} className="chip">{i + 2}. {p.name}</span>)}
            </p>
            <button
              className="button primary big"
              disabled={busy || invited.length === 0}
              onClick={() => void run(async () => {
                const game = await api<OnlineGame>(`/families/${family.id}/games/kniffel`, { method: 'POST', body: { players: invited.map((p) => p.userId) } });
                navigate(`/spiele/kniffel/${game.id}`);
              })}
            >
              {invited.length ? `${invited.length + 1} Spieler einladen und starten` : 'Mindestens eine Person antippen'}
            </button>
            {error && <p className="error">{error}</p>}
          </>
        )}
      </section>
      {best.length > 0 && (
        <section className="card">
          <h2>🏆 Bestenliste</h2>
          <ol className="memory-best">
            {best.filter((b) => member(b.user_id)).map((b) => (
              <li key={b.user_id}><Avatar member={member(b.user_id)!} size={26} /><span>{member(b.user_id)!.name.split(' ')[0]}</span><strong>{b.score} Punkte</strong></li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}

function useBest() {
  const { family } = useFamily();
  const url = `/families/${family.id}/games/scores/kniffel`;
  const [best, setBest] = useState<Best[]>([]);
  const load = useCallback(() => api<Best[]>(url).then(setBest, () => undefined), [url]);
  useEffect(() => {
    void load();
    return onLiveChange((resource) => resource === 'games' && void load());
  }, [load]);
  return best;
}

// --- Spielbrett (gleich für „hier“ und „online“) ------------------------------------------------

function Board({ names, sheets, current, dice, held, rolls, canAct, rolling, finished, waitingFor, onRoll, onToggle, onChoose, note }: {
  names: string[];
  sheets: Sheet[];
  current: number;
  dice: number[];
  held: boolean[];
  rolls: number;
  /** darf ich gerade würfeln/eintragen? */
  canAct: boolean;
  rolling: boolean;
  finished: boolean;
  waitingFor?: string;
  onRoll(): void;
  onToggle(i: number): void;
  onChoose(cat: Category): void;
  note?: string;
}) {
  const ranking = useMemo(() => names.map((name, i) => ({ name, total: total(sheets[i]) })).sort((a, b) => b.total - a.total), [names, sheets]);
  const cell = (i: number, cat: Category) => {
    const value = sheets[i][cat];
    if (value !== undefined) return <td key={i} className="done">{value}</td>;
    if (i !== current || rolls === 0 || finished || !canAct) return <td key={i} />;
    const p = points(cat, dice);
    return <td key={i}><button type="button" className={`kniffel-pick ${p ? '' : 'zero'}`} onClick={() => onChoose(cat)}>{p}</button></td>;
  };
  return (
    <>
      {finished ? (
        <section className="card">
          <h2>🏆 {ranking[0].name} gewinnt!</h2>
          <ol className="memory-best">{ranking.map((r, i) => <li key={i}><span>{r.name}</span><strong>{r.total} Punkte</strong></li>)}</ol>
        </section>
      ) : (
        <section className="card kniffel-turn">
          <p className="game-status">
            {canAct ? (names[current] === 'Du' ? 'Du bist dran' : `${names[current]} ist dran`) : `${waitingFor ?? names[current]} ist dran …`} · Wurf {rolls}/3
          </p>
          {note && <small className="muted">{note}</small>}
          <div className={`dice ${rolling ? 'rolling' : ''}`}>
            {dice.map((d, i) => (
              <button
                key={i}
                type="button"
                className={`die ${held[i] && rolls > 0 ? 'held' : ''}`}
                disabled={!canAct || rolls === 0 || rolls >= 3}
                onClick={() => onToggle(i)}
                aria-label={`Würfel ${d}${held[i] ? ', gehalten' : ''}`}
              >
                {rolls === 0 || !d ? '·' : FACES[d]}
              </button>
            ))}
          </div>
          {canAct && (
            <button className="button primary big" disabled={rolls >= 3} onClick={onRoll}>
              {rolls === 0 ? 'Würfeln' : rolls < 3 ? `Nochmal würfeln (noch ${3 - rolls})` : 'Jetzt eintragen ↓'}
            </button>
          )}
          {canAct && rolls > 0 && <small className="muted">Würfel antippen = festhalten. Unten ein Feld wählen zum Eintragen.</small>}
        </section>
      )}
      <div className="kniffel-sheet-wrap">
        <table className="kniffel-sheet">
          <thead><tr><th />{names.map((n, i) => <th key={i} className={i === current && !finished ? 'current' : ''}>{n}</th>)}</tr></thead>
          <tbody>
            {UPPER.map(([cat, label]) => <tr key={cat}><th>{label}</th>{names.map((_, i) => cell(i, cat))}</tr>)}
            <tr className="sum"><th>Bonus (ab {BONUS_AT})</th>{sheets.map((s, i) => <td key={i}>{bonus(s) ? `+${BONUS}` : `${upperSum(s)}/${BONUS_AT}`}</td>)}</tr>
            {LOWER.map(([cat, label]) => <tr key={cat}><th>{label}</th>{names.map((_, i) => cell(i, cat))}</tr>)}
            <tr className="sum total"><th>Gesamt</th>{sheets.map((s, i) => <td key={i}>{total(s)}</td>)}</tr>
          </tbody>
        </table>
      </div>
    </>
  );
}

const useRolling = () => {
  const [rolling, setRolling] = useState(false);
  const shake = () => {
    setRolling(true);
    setTimeout(() => setRolling(false), 350);
  };
  return { rolling, shake };
};

// --- Hier reihum ------------------------------------------------------------------------------

function Local({ players, onEnd }: { players: Player[]; onEnd(): void }) {
  const { family } = useFamily();
  const [sheets, setSheets] = useState<Sheet[]>(() => players.map(() => ({})));
  const [current, setCurrent] = useState(0);
  const [dice, setDice] = useState<number[]>([1, 2, 3, 4, 5]);
  const [held, setHeld] = useState<boolean[]>([false, false, false, false, false]);
  const [rolls, setRolls] = useState(0);
  const { rolling, shake } = useRolling();
  const [saved, setSaved] = useState(false);
  const finished = sheets.every((s) => CATEGORIES.every((c) => s[c] !== undefined));

  // Ergebnisse der Familienmitglieder in die Bestenliste
  useEffect(() => {
    if (!finished || saved) return;
    setSaved(true);
    for (const [i, p] of players.entries()) {
      if (p.userId !== null) void api(`/families/${family.id}/games/scores`, { method: 'POST', body: { game: 'kniffel', score: total(sheets[i]), user_id: p.userId } }).catch(() => undefined);
    }
  }, [finished, saved, players, sheets, family.id]);

  return (
    <div className="page kniffel">
      <header className="page-header"><h1>🎲 Kniffel</h1><button className="link-button" onClick={() => (finished || confirm('Spiel beenden?')) && onEnd()}>{finished ? 'Neues Spiel' : 'Beenden'}</button></header>
      <Board
        names={players.map((p) => p.name)}
        sheets={sheets}
        current={current}
        dice={dice}
        held={held}
        rolls={rolls}
        canAct
        rolling={rolling}
        finished={finished}
        onRoll={() => {
          if (rolls >= 3) return;
          shake();
          setDice((d) => d.map((v, i) => (held[i] && rolls > 0 ? v : 1 + Math.floor(Math.random() * 6))));
          setRolls((r) => r + 1);
        }}
        onToggle={(i) => setHeld((h) => h.map((x, j) => (j === i ? !x : x)))}
        onChoose={(cat) => {
          if (rolls === 0 || sheets[current][cat] !== undefined) return;
          setSheets((all) => all.map((s, i) => (i === current ? { ...s, [cat]: points(cat, dice) } : s)));
          setCurrent((c) => (c + 1) % players.length);
          setRolls(0);
          setHeld([false, false, false, false, false]);
        }}
      />
    </div>
  );
}

// --- Online ----------------------------------------------------------------------------------

function Online({ id }: { id: number }) {
  const { family, user, member } = useFamily();
  const url = `/families/${family.id}/games/kniffel/${id}`;
  const [game, setGame] = useState<OnlineGame | null>(null);
  const [held, setHeld] = useState<boolean[]>([false, false, false, false, false]);
  const { rolling, shake } = useRolling();
  const { busy, error, run } = useAsync();
  const load = useCallback(() => api<OnlineGame>(url).then(setGame), [url]);
  useEffect(() => {
    void run(load);
    return onLiveChange((resource) => resource === 'games' && void load().catch(() => undefined));
  }, [load]);
  // neuer Zug → nichts mehr festgehalten
  useEffect(() => {
    if (game?.rolls === 0) setHeld([false, false, false, false, false]);
  }, [game?.rolls, game?.current]);

  if (!game) return <div className="page">{error ? <p className="error">{error}</p> : <p className="muted">Lade …</p>}</div>;
  const first = (uid: number) => (uid === user.id ? 'Du' : member(uid)?.name.split(' ')[0] ?? '?');
  const names = game.players.map(first);
  const myTurn = game.status === 'active' && game.players[game.current] === user.id;
  const last = game.last ? `${names[game.last.player]} hat ${game.last.points} bei „${LABEL[game.last.category]}“ eingetragen` : undefined;

  return (
    <div className="page kniffel">
      <header className="page-header">
        <h1>🎲 Kniffel</h1>
        <Link to="/spiele" className="link-button">Alle Spiele</Link>
      </header>
      <div className="kniffel-online-players">
        {game.players.map((uid, i) => {
          const m = member(uid);
          return (
            <span key={uid} className={`game-player ${game.status === 'active' && i === game.current ? 'active' : ''}`}>
              {m && <Avatar member={m} size={24} />} {names[i]}
            </span>
          );
        })}
      </div>
      {game.status === 'cancelled' && <p className="game-status">Das Spiel wurde beendet.</p>}
      <Board
        names={names}
        sheets={game.sheets}
        current={game.current}
        dice={game.dice}
        held={myTurn ? held : game.held}
        rolls={game.rolls}
        canAct={myTurn && !busy}
        rolling={rolling}
        finished={game.status === 'finished'}
        waitingFor={names[game.current]}
        note={game.rolls === 0 ? last : undefined}
        onRoll={() => void run(async () => {
          shake();
          setGame(await api<OnlineGame>(`${url}/roll`, { method: 'POST', body: { held } }));
        })}
        onToggle={(i) => setHeld((h) => h.map((x, j) => (j === i ? !x : x)))}
        onChoose={(cat) => void run(async () => setGame(await api<OnlineGame>(`${url}/score`, { method: 'POST', body: { category: cat } })))}
      />
      {error && <p className="error">{error}</p>}
      {game.status === 'active' && game.created_by === user.id && (
        <div className="game-footer">
          <button className="link-button" disabled={busy} onClick={() => confirm('Spiel für alle beenden?') && void run(async () => setGame(await api<OnlineGame>(`${url}/end`, { method: 'POST' })))}>Spiel beenden</button>
        </div>
      )}
    </div>
  );
}

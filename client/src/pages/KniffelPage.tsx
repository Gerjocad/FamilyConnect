import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { api } from '../api';
import { Avatar } from '../components/Avatar';
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

/** Kniffel für 1–6 Spieler reihum auf einem Handy */
export function KniffelPage() {
  const [players, setPlayers] = useState<Player[] | null>(null);
  return players ? <Game players={players} onEnd={() => setPlayers(null)} /> : <SetupPlayers onStart={setPlayers} />;
}

function SetupPlayers({ onStart }: { onStart(p: Player[]): void }) {
  const { family, user, member } = useFamily();
  const [chosen, setChosen] = useState<Player[]>([{ name: member(user.id)?.name.split(' ')[0] ?? 'Ich', userId: user.id }]);
  const [guest, setGuest] = useState('');
  const best = useBest();
  const toggle = (id: number, name: string) =>
    setChosen((c) => (c.some((p) => p.userId === id) ? c.filter((p) => p.userId !== id) : c.length < 6 ? [...c, { name, userId: id }] : c));
  return (
    <div className="page kniffel">
      <header className="page-header"><h1>🎲 Kniffel</h1><Link to="/spiele" className="link-button">Alle Spiele</Link></header>
      <section className="card form">
        <h2>Wer spielt mit?</h2>
        <p className="muted">Reihum auf diesem Handy – bis zu 6 Spieler.</p>
        <div className="locate-people">
          {family.members.map((m) => (
            <button key={m.id} type="button" className={`locate-person ${chosen.some((p) => p.userId === m.id) ? 'picked' : ''}`} onClick={() => toggle(m.id, m.name.split(' ')[0])}>
              <Avatar member={m} size={40} />
              <span>{m.name.split(' ')[0]}</span>
            </button>
          ))}
        </div>
        <div className="row">
          <input value={guest} onChange={(e) => setGuest(e.target.value)} placeholder="Gast (z. B. Oma)" maxLength={20} aria-label="Gast" />
          <button className="button" disabled={!guest.trim() || chosen.length >= 6} onClick={() => { setChosen([...chosen, { name: guest.trim(), userId: null }]); setGuest(''); }}>+ Gast</button>
        </div>
        <p className="kniffel-order">{chosen.map((p, i) => <span key={`${p.name}-${i}`} className="chip">{i + 1}. {p.name}</span>)}</p>
        <button className="button primary big" disabled={chosen.length === 0} onClick={() => onStart(chosen)}>Los geht's</button>
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

function Game({ players, onEnd }: { players: Player[]; onEnd(): void }) {
  const { family } = useFamily();
  const [sheets, setSheets] = useState<Sheet[]>(() => players.map(() => ({})));
  const [current, setCurrent] = useState(0);
  const [dice, setDice] = useState<number[]>([1, 2, 3, 4, 5]);
  const [held, setHeld] = useState<boolean[]>([false, false, false, false, false]);
  const [rolls, setRolls] = useState(0);
  const [rolling, setRolling] = useState(false);
  const [saved, setSaved] = useState(false);
  const finished = sheets.every((s) => CATEGORIES.every((c) => s[c] !== undefined));

  const roll = () => {
    if (rolls >= 3 || finished) return;
    setRolling(true);
    setTimeout(() => setRolling(false), 350);
    setDice((d) => d.map((v, i) => (held[i] && rolls > 0 ? v : 1 + Math.floor(Math.random() * 6))));
    setRolls((r) => r + 1);
  };

  const choose = (cat: Category) => {
    if (rolls === 0 || sheets[current][cat] !== undefined) return;
    setSheets((all) => all.map((s, i) => (i === current ? { ...s, [cat]: points(cat, dice) } : s)));
    setCurrent((c) => (c + 1) % players.length);
    setRolls(0);
    setHeld([false, false, false, false, false]);
  };

  // Ergebnisse der Familienmitglieder in die Bestenliste
  useEffect(() => {
    if (!finished || saved) return;
    setSaved(true);
    for (const [i, p] of players.entries()) {
      if (p.userId !== null) void api(`/families/${family.id}/games/scores`, { method: 'POST', body: { game: 'kniffel', score: total(sheets[i]), user_id: p.userId } }).catch(() => undefined);
    }
  }, [finished, saved, players, sheets, family.id]);

  const ranking = useMemo(() => players.map((p, i) => ({ ...p, total: total(sheets[i]) })).sort((a, b) => b.total - a.total), [players, sheets]);
  const cell = (i: number, cat: Category) => {
    const value = sheets[i][cat];
    if (value !== undefined) return <td key={i} className="done">{value}</td>;
    if (i !== current || rolls === 0 || finished) return <td key={i} />;
    const p = points(cat, dice);
    return <td key={i}><button type="button" className={`kniffel-pick ${p ? '' : 'zero'}`} onClick={() => choose(cat)}>{p}</button></td>;
  };

  return (
    <div className="page kniffel">
      <header className="page-header"><h1>🎲 Kniffel</h1><button className="link-button" onClick={() => confirm('Spiel beenden?') && onEnd()}>Beenden</button></header>
      {finished ? (
        <section className="card">
          <h2>🏆 {ranking[0].name} gewinnt!</h2>
          <ol className="memory-best">{ranking.map((r, i) => <li key={i}><span>{r.name}</span><strong>{r.total} Punkte</strong></li>)}</ol>
          <div className="game-footer"><button className="button primary" onClick={onEnd}>Neues Spiel</button></div>
        </section>
      ) : (
        <section className="card kniffel-turn">
          <p className="game-status">{players[current].name} ist dran · Wurf {rolls}/3</p>
          <div className={`dice ${rolling ? 'rolling' : ''}`}>
            {dice.map((d, i) => (
              <button
                key={i}
                type="button"
                className={`die ${held[i] && rolls > 0 ? 'held' : ''}`}
                disabled={rolls === 0 || rolls >= 3}
                onClick={() => setHeld((h) => h.map((x, j) => (j === i ? !x : x)))}
                aria-label={`Würfel ${d}${held[i] ? ', gehalten' : ''}`}
              >
                {rolls === 0 ? '·' : FACES[d]}
              </button>
            ))}
          </div>
          <button className="button primary big" disabled={rolls >= 3} onClick={roll}>
            {rolls === 0 ? 'Würfeln' : rolls < 3 ? `Nochmal würfeln (noch ${3 - rolls})` : 'Jetzt eintragen ↓'}
          </button>
          {rolls > 0 && <small className="muted">Würfel antippen = festhalten. Unten ein Feld wählen zum Eintragen.</small>}
        </section>
      )}
      <div className="kniffel-sheet-wrap">
        <table className="kniffel-sheet">
          <thead><tr><th />{players.map((p, i) => <th key={i} className={i === current && !finished ? 'current' : ''}>{p.name}</th>)}</tr></thead>
          <tbody>
            {UPPER.map(([cat, label]) => <tr key={cat}><th>{label}</th>{players.map((_, i) => cell(i, cat))}</tr>)}
            <tr className="sum"><th>Bonus (ab {BONUS_AT})</th>{sheets.map((s, i) => <td key={i}>{bonus(s) ? `+${BONUS}` : `${upperSum(s)}/${BONUS_AT}`}</td>)}</tr>
            {LOWER.map(([cat, label]) => <tr key={cat}><th>{label}</th>{players.map((_, i) => cell(i, cat))}</tr>)}
            <tr className="sum total"><th>Gesamt</th>{sheets.map((s, i) => <td key={i}>{total(s)}</td>)}</tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

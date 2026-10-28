import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { api } from '../api';
import { Avatar } from '../components/Avatar';
import { MEMORY_THEMES } from '../games';
import { onLiveChange } from '../live';
import { useFamily } from '../session';

interface Card { id: number; emoji: string; found: boolean }
interface Best { user_id: number; score: number; seconds: number | null }

const PAIRS = 8;
const shuffle = <T,>(list: T[]) => {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
const deal = (theme: string): Card[] =>
  shuffle(shuffle(MEMORY_THEMES[theme]).slice(0, PAIRS).flatMap((emoji) => [emoji, emoji])).map((emoji, id) => ({ id, emoji, found: false }));
const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

/** Memory: 8 Paare, Züge und Zeit zählen; das beste Ergebnis je Person kommt in die Familien-Bestenliste */
export function MemoryPage() {
  const { family, member } = useFamily();
  const base = `/families/${family.id}/games/scores`;
  const [theme, setTheme] = useState('Tiere');
  const [cards, setCards] = useState(() => deal('Tiere'));
  const [open, setOpen] = useState<number[]>([]);
  const [moves, setMoves] = useState(0);
  const [start, setStart] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const [best, setBest] = useState<Best[]>([]);
  const done = cards.every((c) => c.found);
  const seconds = start ? Math.round(((done ? now : Date.now()) - start) / 1000) : 0;

  const loadBest = useCallback(() => api<Best[]>(`${base}/memory`).then(setBest, () => undefined), [base]);
  useEffect(() => {
    void loadBest();
    return onLiveChange((resource) => resource === 'games' && void loadBest());
  }, [loadBest]);

  // Uhr
  useEffect(() => {
    if (!start || done) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [start, done]);

  const restart = (t = theme) => {
    setTheme(t);
    setCards(deal(t));
    setOpen([]);
    setMoves(0);
    setStart(null);
  };

  const flip = (card: Card) => {
    if (card.found || open.includes(card.id) || open.length === 2) return;
    if (!start) setStart(Date.now());
    const next = [...open, card.id];
    setOpen(next);
    if (next.length < 2) return;
    setMoves((m) => m + 1);
    const [a, b] = next.map((id) => cards.find((c) => c.id === id)!);
    if (a.emoji === b.emoji) {
      const updated = cards.map((c) => (c.id === a.id || c.id === b.id ? { ...c, found: true } : c));
      setCards(updated);
      setOpen([]);
      if (updated.every((c) => c.found)) {
        const end = Date.now();
        setNow(end);
        void api(base, { method: 'POST', body: { game: 'memory', score: moves + 1, seconds: Math.round((end - (start ?? end)) / 1000) } }).then(loadBest, () => undefined);
      }
    } else {
      setTimeout(() => setOpen([]), 900);
    }
  };

  const ranking = useMemo(() => best.filter((b) => member(b.user_id)), [best, member]);

  return (
    <div className="page memory-page">
      <header className="page-header">
        <h1>🃏 Memory</h1>
        <Link to="/spiele" className="link-button">Alle Spiele</Link>
      </header>
      <div className="radius-chips">
        {Object.keys(MEMORY_THEMES).map((t) => (
          <button key={t} type="button" className={`chip ${theme === t ? 'chip-active' : ''}`} onClick={() => restart(t)}>{MEMORY_THEMES[t][0]} {t}</button>
        ))}
      </div>
      <p className="game-status">{done ? `Geschafft in ${moves} Zügen und ${clock(seconds)}! 🎉` : `Züge: ${moves} · Zeit: ${clock(seconds)}`}</p>
      <div className="memory-grid">
        {cards.map((c) => {
          const shown = c.found || open.includes(c.id);
          return (
            <button key={c.id} type="button" className={`memory-card ${shown ? 'shown' : ''} ${c.found ? 'found' : ''}`} onClick={() => flip(c)} aria-label={shown ? c.emoji : 'verdeckte Karte'}>
              <span>{shown ? c.emoji : ''}</span>
            </button>
          );
        })}
      </div>
      <div className="game-footer"><button className="button primary" onClick={() => restart()}>Neues Spiel</button></div>
      {ranking.length > 0 && (
        <section className="card">
          <h2>🏆 Bestenliste der Familie</h2>
          <ol className="memory-best">
            {ranking.map((b) => (
              <li key={b.user_id}>
                <Avatar member={member(b.user_id)!} size={26} />
                <span>{member(b.user_id)!.name.split(' ')[0]}</span>
                <strong>{b.score} Züge</strong>
                {b.seconds !== null && <small className="muted">{clock(b.seconds)}</small>}
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}

import { useEffect, useState } from 'react';
import { api } from '../api';
import { iconFromDataUrl } from '../images';
import { useFamily } from '../session';
import type { EventIcon } from '../types';
import { Icon } from './Icon';
import { useAsync } from './useAsync';

interface Opponent { name: string; badge: string | null; sources: string[]; games: number }
interface LogoResult { label: string; detail: string; image: string; source: string }

/**
 * Gegner-Assistent: sucht alle Gegner eines Vereins (Kalender + Sport-Datenbank, server/src/logoSearch.js)
 * und fragt dann nacheinander, welches Logo jeder bekommt. Jedes gewählte Logo wird gleich als
 * „nur zusammen mit <Verein>“ gespeichert.
 */
export function OpponentWizard({ team, onCreate, onClose }: {
  team: string;
  onCreate(data: Partial<EventIcon>): Promise<unknown>;
  onClose(): void;
}) {
  const { family } = useFamily();
  const base = `/families/${family.id}/logos`;
  const [opponents, setOpponents] = useState<Opponent[] | null>(null);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [extra, setExtra] = useState('');
  // null = Auswahl; sonst die Gegner, die nacheinander abgefragt werden (step = aktueller)
  const [queue, setQueue] = useState<string[] | null>(null);
  const [step, setStep] = useState(0);
  const [added, setAdded] = useState<string[]>([]);
  const { busy, error, run } = useAsync();

  useEffect(() => {
    void run(async () => {
      const list = await api<Opponent[]>(`${base}/opponents?team=${encodeURIComponent(team)}`);
      setOpponents(list);
      setChosen(new Set(list.map((o) => o.name)));
    });
  }, [base, team]);

  const toggle = (name: string) => setChosen((c) => {
    const next = new Set(c);
    if (next.has(name)) next.delete(name); else next.add(name);
    return next;
  });

  const addExtra = () => {
    const name = extra.trim();
    if (name.length < 2 || opponents?.some((o) => o.name.toLocaleLowerCase('tr') === name.toLocaleLowerCase('tr'))) return;
    setOpponents([{ name, badge: null, sources: ['von dir'], games: 0 }, ...(opponents ?? [])]);
    setChosen((c) => new Set(c).add(name));
    setExtra('');
  };

  // --- Fertig -------------------------------------------------------------------------
  if (queue && step >= queue.length) {
    return (
      <div className="opponent-wizard">
        <h3>Fertig 🎉</h3>
        <p>
          {added.length
            ? <>{added.length} {added.length === 1 ? 'Gegner-Logo' : 'Gegner-Logos'} hinzugefügt: {added.join(', ')}.</>
            : 'Kein Logo hinzugefügt.'}
        </p>
        <p className="muted">Bei „{team} – Gegner“ stehen jetzt beide Wappen im Kalender.</p>
        <div className="form-actions"><span className="spacer" /><button type="button" className="button primary" onClick={onClose}>Schließen</button></div>
      </div>
    );
  }

  // --- Nacheinander abfragen --------------------------------------------------------------
  if (queue) {
    const name = queue[step];
    const opponent = opponents?.find((o) => o.name === name);
    return (
      <OpponentStep
        key={name}
        name={name}
        badge={opponent?.badge ?? null}
        position={`${step + 1} von ${queue.length}`}
        onPick={async (keyword, image) => {
          await onCreate({ keyword, only_with: team, highlight: false, image });
          setAdded((a) => [...a, keyword]);
          setStep((s) => s + 1);
        }}
        onSkip={() => setStep((s) => s + 1)}
        onStop={() => setStep(queue.length)}
      />
    );
  }

  // --- Auswahl ------------------------------------------------------------------------
  return (
    <div className="opponent-wizard">
      <div className="logo-search-head">
        <h3>Gegner von {team}</h3>
        <button type="button" className="link-button" onClick={onClose}>Zurück</button>
      </div>
      {!opponents && <p className="muted">{busy ? `Suche alle Gegner von ${team} …` : ''}</p>}
      {opponents && (
        <>
          <p className="muted">
            Aus deinem Kalender und der Liga gefunden – Vereine, die schon ein Logo haben, fehlen hier. Abwählen, was du nicht
            brauchst; danach fragt die App dich Verein für Verein nach dem Logo.
          </p>
          <div className="row">
            <input value={extra} onChange={(e) => setExtra(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addExtra(); } }} placeholder="Weiteren Gegner hinzufügen" aria-label="Weiterer Gegner" />
            <button type="button" className="button" disabled={extra.trim().length < 2} onClick={addExtra}><Icon name="plus" size={18} /></button>
          </div>
          <div className="row wrap">
            <button type="button" className="link-button" onClick={() => setChosen(new Set(opponents.map((o) => o.name)))}>Alle</button>
            <button type="button" className="link-button" onClick={() => setChosen(new Set())}>Keine</button>
          </div>
          <ul className="opponent-list">
            {opponents.map((o) => (
              <li key={o.name}>
                <label className="checkbox">
                  <input type="checkbox" checked={chosen.has(o.name)} onChange={() => toggle(o.name)} />
                  {o.badge ? <img src={o.badge} alt="" referrerPolicy="no-referrer" /> : <span className="opponent-nobadge">?</span>}
                  <span>
                    {o.name}
                    <small className="muted">
                      {o.games ? `${o.games}× im Kalender` : ''}{o.games && o.sources.length > 1 ? ' · ' : ''}
                      {o.sources.filter((s) => s !== 'Kalender').join(' · ')}
                    </small>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <div className="form-actions">
            <button type="button" className="button" onClick={onClose}>Abbrechen</button>
            <span className="spacer" />
            <button
              type="button"
              className="button primary"
              disabled={chosen.size === 0}
              onClick={() => { setQueue(opponents.filter((o) => chosen.has(o.name)).map((o) => o.name)); setStep(0); }}
            >
              Los geht's ({chosen.size})
            </button>
          </div>
        </>
      )}
      {error && <p className="error">{error}</p>}
    </div>
  );
}

/** Ein Gegner: Wappen aus der Liga plus Suchtreffer – antippen = übernehmen */
function OpponentStep({ name, badge, position, onPick, onSkip, onStop }: {
  name: string;
  badge: string | null;
  position: string;
  onPick(keyword: string, image: string): Promise<void>;
  onSkip(): void;
  onStop(): void;
}) {
  const { family } = useFamily();
  const base = `/families/${family.id}/logos`;
  const [keyword, setKeyword] = useState(name);
  const [results, setResults] = useState<LogoResult[] | null>(null);
  const [picking, setPicking] = useState<string | null>(null);
  const { busy, error, run } = useAsync();

  const search = (q: string) => void run(async () => {
    const found = await api<LogoResult[]>(`${base}/search?q=${encodeURIComponent(q)}`);
    const league: LogoResult[] = badge ? [{ label: name, detail: 'Liga-Wappen', image: badge, source: 'TheSportsDB' }] : [];
    setResults([...league, ...found.filter((f) => f.image !== badge)]);
  });
  useEffect(() => search(name), [name]);

  const pick = (url: string) => {
    setPicking(url);
    void run(async () => {
      try {
        const { image } = await api<{ image: string }>(`${base}/download`, { method: 'POST', body: { url } });
        await onPick(keyword.trim() || name, await iconFromDataUrl(image));
      } finally {
        setPicking(null);
      }
    });
  };

  return (
    <div className="opponent-wizard">
      <div className="logo-search-head">
        <small className="muted">{position}</small>
        <button type="button" className="link-button" onClick={onStop}>Beenden</button>
      </div>
      <h3>Welches Logo für {name}?</h3>
      <label>
        Stichwort im Kalender <span className="hint">(so, wie du den Verein in Termine schreibst)</span>
        <input value={keyword} onChange={(e) => setKeyword(e.target.value)} maxLength={60} />
      </label>
      {!results && <p className="muted">Suche Logos …</p>}
      {results && (results.length ? (
        <div className="logo-results">
          {results.map((r) => (
            <button type="button" key={r.image} className="logo-result" disabled={busy || !keyword.trim()} onClick={() => pick(r.image)} title={`${r.label} (${r.source})`}>
              <img src={r.image} alt="" loading="lazy" referrerPolicy="no-referrer" />
              <span>{picking === r.image ? 'Lädt …' : r.label}</span>
              <small className="muted">{r.detail}</small>
            </button>
          ))}
        </div>
      ) : <p className="muted">Nichts gefunden.</p>)}
      <div className="row">
        <button type="button" className="button" disabled={busy} onClick={() => search(keyword.trim() || name)}>
          <Icon name="search" size={18} /> Nochmal mit „{keyword.trim() || name}“ suchen
        </button>
      </div>
      {error && <p className="error">{error}</p>}
      <div className="form-actions">
        <span className="spacer" />
        <button type="button" className="button" disabled={busy} onClick={onSkip}>Überspringen</button>
      </div>
    </div>
  );
}

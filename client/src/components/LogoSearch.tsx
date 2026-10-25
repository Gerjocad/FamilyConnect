import { useState, type KeyboardEvent } from 'react';
import { api } from '../api';
import { iconFromDataUrl } from '../images';
import { useFamily } from '../session';
import { Icon } from './Icon';
import { useAsync } from './useAsync';

interface LogoResult { label: string; detail: string; image: string; source: string }

const googleImages = (q: string) => `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(`${q} logo png`)}`;

/**
 * Logo finden statt Datei auswählen: Vereinswappen und Wikipedia-Bilder direkt hier, oder in Google suchen und
 * die Bildadresse einfügen. Der Server lädt das Bild (server/src/logoSearch.js), hier wird es auf 96 px verkleinert.
 * Steht im Formular des Logo-Dialogs, deshalb ohne eigenes <form> (Enter wird abgefangen).
 */
export function LogoSearch({ initial, onPick, onClose }: { initial: string; onPick(image: string): void; onClose(): void }) {
  const { family } = useFamily();
  const base = `/families/${family.id}/logos`;
  const [query, setQuery] = useState(initial);
  const [results, setResults] = useState<LogoResult[] | null>(null);
  const [address, setAddress] = useState('');
  const [picking, setPicking] = useState<string | null>(null);
  const { busy, error, run } = useAsync();

  /** Enter im Feld: eigene Aktion statt das äußere Formular abzuschicken */
  const onEnter = (action: () => void) => (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    action();
  };

  const search = () => {
    if (query.trim().length < 2) return;
    void run(async () => setResults(await api<LogoResult[]>(`${base}/search?q=${encodeURIComponent(query.trim())}`)));
  };

  const pick = (url: string) => {
    setPicking(url);
    void run(async () => {
      try {
        const { image } = await api<{ image: string }>(`${base}/download`, { method: 'POST', body: { url } });
        onPick(await iconFromDataUrl(image));
      } finally {
        setPicking(null);
      }
    });
  };

  return (
    <div className="logo-search">
      <div className="logo-search-head">
        <strong>Logo suchen</strong>
        <button type="button" className="icon-button" aria-label="Suche schließen" onClick={onClose}><Icon name="close" size={18} /></button>
      </div>
      <div className="row">
        <input value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={onEnter(search)} placeholder="z. B. Galatasaray" aria-label="Suchbegriff" autoFocus />
        <button type="button" className="button primary" disabled={busy || query.trim().length < 2} onClick={search}><Icon name="search" size={18} /> Suchen</button>
      </div>

      {results && (results.length ? (
        <div className="logo-results">
          {results.map((r) => (
            <button type="button" key={r.image} className="logo-result" disabled={busy} onClick={() => pick(r.image)} title={`${r.label} (${r.source})`}>
              <img src={r.image} alt="" loading="lazy" referrerPolicy="no-referrer" />
              <span>{picking === r.image ? 'Lädt …' : r.label}</span>
              <small className="muted">{r.detail}</small>
            </button>
          ))}
        </div>
      ) : <p className="muted">Nichts gefunden – anders schreiben oder in Google suchen.</p>)}

      <div className="logo-google">
        <a className="button" href={googleImages(query.trim() || initial)} target="_blank" rel="noopener noreferrer">
          <Icon name="search" size={18} /> Bei Google suchen
        </a>
        <small className="hint">
          In Google ein Logo antippen, dann lange auf das große Bild drücken → <b>„Bildadresse kopieren“</b> und hier einfügen:
        </small>
        <div className="row">
          <input value={address} onChange={(e) => setAddress(e.target.value)} onKeyDown={onEnter(() => address.trim() && pick(address.trim()))} placeholder="https://…" inputMode="url" aria-label="Bildadresse" />
          <button type="button" className="button" disabled={busy || !address.trim()} onClick={() => pick(address.trim())}>Übernehmen</button>
        </div>
      </div>
      {error && <p className="error">{error}</p>}
    </div>
  );
}

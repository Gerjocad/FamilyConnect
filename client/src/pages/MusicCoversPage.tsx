import { useState } from 'react';
import { Link } from 'react-router';
import { Icon } from '../components/Icon';
import { useMusic } from '../music';

/** Cover der Musik-Karten in Originalgröße (62 × 62 mm) zum Ausdrucken, Ausschneiden und Aufkleben */
export function MusicCoversPage() {
  const music = useMusic();
  const [names, setNames] = useState(true);
  const [selected, setSelected] = useState<number[] | null>(null);
  const chosen = music.cards.filter((c) => selected === null || selected.includes(c.id));
  const toggle = (id: number) => {
    const current = selected ?? music.cards.map((c) => c.id);
    setSelected(current.includes(id) ? current.filter((x) => x !== id) : [...current, id]);
  };

  return (
    <div className="page cover-page">
      <header className="page-header no-print">
        <h1>Cover drucken</h1>
        <button className="button primary" onClick={() => print()} disabled={chosen.length === 0}><Icon name="download" size={18} /> Drucken</button>
      </header>
      <div className="no-print cover-options">
        <p className="muted">
          Jedes Cover ist 62 × 62 mm groß und passt auf die Vorderseite der Karte (64 × 64 mm). Beim Drucken <b>„Tatsächliche Größe“ / 100 %</b> wählen,
          am besten auf Fotopapier, entlang der Linie ausschneiden und aufkleben.
        </p>
        <label className="checkbox"><input type="checkbox" checked={names} onChange={(e) => setNames(e.target.checked)} /> Namen unten aufs Cover</label>
        <div className="member-picker">
          {music.cards.map((c) => (
            <button key={c.id} type="button" className={`chip ${chosen.some((x) => x.id === c.id) ? 'chip-active' : ''}`} onClick={() => toggle(c.id)}>
              {c.emoji} {c.name}
            </button>
          ))}
        </div>
        <Link to="/musik" className="link-button">← Zurück zur Musik</Link>
      </div>
      <div className="cover-sheet">
        {chosen.map((c) => (
          <div key={c.id} className="cover">
            {c.image ? <img src={c.image} alt="" /> : <span className="cover-emoji">{c.emoji}</span>}
            {names && <span className="cover-name">{c.name}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

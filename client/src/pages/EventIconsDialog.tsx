import { useState } from 'react';
import { Icon } from '../components/Icon';
import { LogoSearch } from '../components/LogoSearch';
import { Modal } from '../components/Modal';
import { useAsync } from '../components/useAsync';
import { iconImage } from '../images';
import type { EventIcon } from '../types';

interface Props {
  icons: EventIcon[];
  canEdit: boolean;
  onCreate(data: Partial<EventIcon>): Promise<unknown>;
  onUpdate(id: number, data: Partial<EventIcon>): Promise<unknown>;
  onDelete(id: number): Promise<unknown>;
  onClose(): void;
}

/** Logos im Kalender verwalten: Stichwort im Titel → kleines Bild am Termin */
export function EventIconsDialog({ icons, canEdit, onCreate, onUpdate, onDelete, onClose }: Props) {
  const [keyword, setKeyword] = useState('');
  const [onlyWith, setOnlyWith] = useState('');
  const [highlight, setHighlight] = useState(false);
  const [searching, setSearching] = useState(false);
  const [image, setImage] = useState<string | null>(null);
  const { busy, error, run } = useAsync();

  const pick = (file: File | undefined) => {
    if (file) void run(async () => setImage(await iconImage(file)));
  };

  return (
    <Modal title="Logos im Kalender" onClose={onClose}>
      <div className="form">
        <p className="muted">
          Steht das Stichwort im Titel eines Termins, zeigt der Kalender das Logo daneben – z. B. „Fenerbahçe“ für alle Spiele.
          Für den Gegner ein weiteres Logo anlegen, z. B. „Galatasaray“ <b>nur zusammen mit</b> „Fenerbahçe“: Bei
          „Fenerbahçe – Galatasaray“ stehen dann beide Wappen in der Reihenfolge des Titels.
          Groß-/Kleinschreibung und Sonderzeichen (ç, ş, ı …) sind egal.
        </p>
        {icons.length > 0 && (
          <ul className="event-icon-list">
            {icons.map((i) => (
              <li key={i.id}>
                <img src={i.image} alt="" className="event-icon-preview" />
                <span className="event-icon-label">
                  <strong>{i.keyword}</strong>
                  {i.only_with && <small className="muted">nur zusammen mit „{i.only_with}“</small>}
                  {!i.only_with && (canEdit ? (
                    <button
                      type="button"
                      className={`chip highlight-chip ${i.highlight ? 'chip-active' : ''}`}
                      aria-pressed={i.highlight}
                      disabled={busy}
                      onClick={() => void run(() => onUpdate(i.id, { highlight: !i.highlight }))}
                    >
                      📺 {i.highlight ? 'Groß auf dem Wanddisplay' : 'Groß auf dem Wanddisplay?'}
                    </button>
                  ) : i.highlight && <small className="muted">📺 groß auf dem Wanddisplay</small>)}
                </span>
                <span className="spacer" />
                {canEdit && (
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={`Logo für ${i.keyword} löschen`}
                    disabled={busy}
                    onClick={() => confirm(`Logo für „${i.keyword}“ löschen?`) && void run(() => onDelete(i.id))}
                  >
                    <Icon name="trash" size={18} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        {canEdit ? (
          <form
            className="event-icon-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (!image) return;
              void run(async () => {
                await onCreate({ keyword: keyword.trim(), only_with: onlyWith.trim(), highlight: !onlyWith.trim() && highlight, image });
                setKeyword('');
                setOnlyWith('');
                setHighlight(false);
                setImage(null);
              });
            }}
          >
            <label>
              Stichwort
              <input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="z. B. Galatasaray" maxLength={60} required />
            </label>
            <label>
              Nur zusammen mit <span className="hint">(optional – fürs Gegner-Wappen)</span>
              <input value={onlyWith} onChange={(e) => setOnlyWith(e.target.value)} placeholder="z. B. Fenerbahçe" maxLength={60} list="event-icon-keywords" />
              <datalist id="event-icon-keywords">
                {[...new Set(icons.filter((i) => !i.only_with).map((i) => i.keyword))].map((k) => <option key={k} value={k} />)}
              </datalist>
            </label>
            {!onlyWith.trim() && (
              <label className="checkbox">
                <input type="checkbox" checked={highlight} onChange={(e) => setHighlight(e.target.checked)} />
                Spiele heute/morgen groß auf dem Wanddisplay zeigen
              </label>
            )}
            {keyword.trim() && (
              <small className="hint">
                Logo erscheint bei Terminen mit „{keyword.trim()}“ im Titel
                {onlyWith.trim() ? <> – aber nur, wenn auch „{onlyWith.trim()}“ drinsteht</> : null}.
              </small>
            )}
            {searching ? (
              <LogoSearch initial={keyword.trim()} onPick={(img) => { setImage(img); setSearching(false); }} onClose={() => setSearching(false)} />
            ) : (
              <div className="row wrap">
                <button type="button" className="button" onClick={() => setSearching(true)}>
                  <Icon name="search" size={18} /> Logo suchen
                </button>
                <label className="button file-button">
                  <Icon name="download" size={18} /> Datei
                  <input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => pick(e.target.files?.[0])} />
                </label>
              </div>
            )}
            <div className="row align-end">
              {image ? <img src={image} alt="Gewähltes Logo" className="event-icon-chosen" /> : <span className="muted">Noch kein Logo gewählt</span>}
              <span className="spacer" />
              <button className="button primary" disabled={busy || !image || !keyword.trim()}>Hinzufügen</button>
            </div>
            <small className="hint">Am besten ein PNG mit durchsichtigem Hintergrund; es wird automatisch verkleinert.</small>
          </form>
        ) : (
          <p className="hint">Logos legen die Eltern an.</p>
        )}
        {error && <p className="error">{error}</p>}
        <div className="form-actions">
          <span className="spacer" />
          <button type="button" className="button" onClick={onClose}>Fertig</button>
        </div>
      </div>
    </Modal>
  );
}

import { useRef, useState } from 'react';
import { Icon } from '../components/Icon';
import { LogoSearch } from '../components/LogoSearch';
import { OpponentWizard } from '../components/OpponentWizard';
import { Modal } from '../components/Modal';
import { useAsync } from '../components/useAsync';
import { normalize } from '../eventIcons';
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
  // Logo, das gerade geändert wird (null = neues Logo anlegen)
  const [editing, setEditing] = useState<EventIcon | null>(null);
  // Gegner-Assistent für diesen Verein
  const [opponentsOf, setOpponentsOf] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const { busy, error, run } = useAsync();

  const reset = () => {
    setEditing(null);
    setKeyword('');
    setOnlyWith('');
    setHighlight(false);
    setImage(null);
    setSearching(false);
  };

  const startEdit = (i: EventIcon) => {
    setEditing(i);
    setKeyword(i.keyword);
    setOnlyWith(i.only_with ?? '');
    setHighlight(Boolean(i.highlight));
    setImage(i.image);
    setSearching(false);
    requestAnimationFrame(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };

  const pick = (file: File | undefined) => {
    if (file) void run(async () => setImage(await iconImage(file)));
  };

  // Logos mit „nur zusammen mit“ stehen eingeklappt unter dem Logo, zu dem sie gehören
  const groups = (() => {
    const key = (t: string) => normalize(t).trim();
    const parents = icons.filter((i) => !i.only_with || !icons.some((p) => !p.only_with && key(p.keyword) === key(i.only_with)));
    return parents.map((parent) => ({
      parent,
      children: parent.only_with ? [] : icons
        .filter((c) => c.only_with && key(c.only_with) === key(parent.keyword))
        .sort((a, b) => a.keyword.localeCompare(b.keyword, 'tr')),
    }));
  })();

  const row = (i: EventIcon, child = false) => (
    <div className={`event-icon-row ${editing?.id === i.id ? 'editing' : ''}`}>
      <img src={i.image} alt="" className="event-icon-preview" />
      <span className="event-icon-label">
        <strong>{i.keyword}</strong>
        {i.only_with && !child && <small className="muted">nur zusammen mit „{i.only_with}“</small>}
        {!i.only_with && (canEdit ? (
          <span className="row wrap event-icon-actions">
            <button
              type="button"
              className={`chip highlight-chip ${i.highlight ? 'chip-active' : ''}`}
              aria-pressed={i.highlight}
              disabled={busy}
              onClick={() => void run(() => onUpdate(i.id, { highlight: !i.highlight }))}
            >
              📺 {i.highlight ? 'Groß auf dem Wanddisplay' : 'Groß auf dem Wanddisplay?'}
            </button>
            <button type="button" className="chip highlight-chip" disabled={busy} onClick={() => setOpponentsOf(i.keyword)}>
              ⚽ Gegner-Logos suchen
            </button>
          </span>
        ) : i.highlight && <small className="muted">📺 groß auf dem Wanddisplay</small>)}
      </span>
      <span className="spacer" />
      {canEdit && (
        <button type="button" className="icon-button" aria-label={`Logo für ${i.keyword} ändern`} disabled={busy} onClick={() => startEdit(i)}>
          <Icon name="edit" size={18} />
        </button>
      )}
      {canEdit && (
        <button
          type="button"
          className="icon-button"
          aria-label={`Logo für ${i.keyword} löschen`}
          disabled={busy}
          onClick={() => confirm(`Logo für „${i.keyword}“ löschen?`) && void run(async () => {
            await onDelete(i.id);
            if (editing?.id === i.id) reset();
          })}
        >
          <Icon name="trash" size={18} />
        </button>
      )}
    </div>
  );

  if (opponentsOf) {
    return (
      <Modal title="Gegner-Logos" onClose={onClose}>
        <div className="form">
          <OpponentWizard team={opponentsOf} onCreate={onCreate} onClose={() => setOpponentsOf(null)} />
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="Logos im Kalender" onClose={onClose}>
      <div className="form">
        <p className="muted">Steht das Stichwort im Termintitel, erscheint das Logo daneben.</p>
        {icons.length > 0 && (
          <ul className="event-icon-list">
            {groups.map(({ parent, children }) => (
              <li key={parent.id} className="event-icon-group">
                {row(parent)}
                {children.length > 0 && (
                  <details className="event-icon-children" open={children.some((c) => c.id === editing?.id) || undefined}>
                    <summary>
                      {children.length} {children.length === 1 ? 'Logo' : 'Logos'} nur zusammen mit „{parent.keyword}“
                      <span className="event-icon-thumbs" aria-hidden>
                        {children.slice(0, 6).map((c) => <img key={c.id} src={c.image} alt="" />)}
                      </span>
                    </summary>
                    <ul className="event-icon-list">
                      {children.map((c) => <li key={c.id}>{row(c, true)}</li>)}
                    </ul>
                  </details>
                )}
              </li>
            ))}
          </ul>
        )}
        {canEdit ? (
          <form
            ref={formRef}
            className="event-icon-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (!image) return;
              void run(async () => {
                const data = { keyword: keyword.trim(), only_with: onlyWith.trim(), highlight: !onlyWith.trim() && highlight, image };
                await (editing ? onUpdate(editing.id, data) : onCreate(data));
                reset();
              });
            }}
          >
            <h3 className="event-icon-form-title">{editing ? `Logo „${editing.keyword}“ ändern` : 'Neues Logo'}</h3>
            <label>
              Stichwort
              <input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="z. B. Galatasaray" maxLength={60} required />
            </label>
            <label>
              Nur zusammen mit <span className="hint">(optional – fürs Gegner-Wappen)</span>
              <input value={onlyWith} onChange={(e) => setOnlyWith(e.target.value)} placeholder="z. B. Fenerbahçe" maxLength={60} list="event-icon-keywords" />
              <datalist id="event-icon-keywords">
                {[...new Set(icons.filter((i) => !i.only_with && i.id !== editing?.id).map((i) => i.keyword))].map((k) => <option key={k} value={k} />)}
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
              {editing && <button type="button" className="button" disabled={busy} onClick={reset}>Abbrechen</button>}
              <button className="button primary" disabled={busy || !image || !keyword.trim()}>{editing ? 'Speichern' : 'Hinzufügen'}</button>
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

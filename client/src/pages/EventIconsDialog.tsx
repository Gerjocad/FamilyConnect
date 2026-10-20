import { useState } from 'react';
import { Icon } from '../components/Icon';
import { Modal } from '../components/Modal';
import { useAsync } from '../components/useAsync';
import { iconImage } from '../images';
import type { EventIcon } from '../types';

interface Props {
  icons: EventIcon[];
  canEdit: boolean;
  onCreate(data: Partial<EventIcon>): Promise<unknown>;
  onDelete(id: number): Promise<unknown>;
  onClose(): void;
}

/** Logos im Kalender verwalten: Stichwort im Titel → kleines Bild am Termin */
export function EventIconsDialog({ icons, canEdit, onCreate, onDelete, onClose }: Props) {
  const [keyword, setKeyword] = useState('');
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
          Groß-/Kleinschreibung und Sonderzeichen (ç, ş, ı …) sind egal.
        </p>
        {icons.length > 0 && (
          <ul className="event-icon-list">
            {icons.map((i) => (
              <li key={i.id}>
                <img src={i.image} alt="" className="event-icon-preview" />
                <strong>{i.keyword}</strong>
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
                await onCreate({ keyword: keyword.trim(), image });
                setKeyword('');
                setImage(null);
              });
            }}
          >
            <label>
              Stichwort
              <input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="z. B. Fenerbahçe" maxLength={60} required />
            </label>
            <div className="row align-end">
              <label className="button file-button">
                {image ? <img src={image} alt="" className="event-icon-preview" /> : <Icon name="download" size={18} />}
                {image ? 'Anderes Bild' : 'Logo auswählen'}
                <input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => pick(e.target.files?.[0])} />
              </label>
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

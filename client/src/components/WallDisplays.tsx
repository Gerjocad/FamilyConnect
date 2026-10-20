import { useEffect, useState } from 'react';
import { api } from '../api';
import { formatTimestamp } from '../dates';
import { useFamily } from '../session';
import { Icon } from './Icon';
import { useAsync } from './useAsync';

interface WallDisplay { id: number; name: string; token: string; created_at: string; last_seen_at: string | null }

const dashed = (code: string) => code.replace(/(.{4})(?=.)/g, '$1-');

/** Familie & Profil: Codes für Wanddisplays (z. B. altes Fire-Tablet) anlegen und widerrufen – nur Admins */
export function WallDisplays() {
  const { family } = useFamily();
  const base = `/families/${family.id}/wall-displays`;
  const [items, setItems] = useState<WallDisplay[] | null>(null);
  const [name, setName] = useState('');
  const { busy, error, run } = useAsync();
  const address = `${location.host}/wand`;

  useEffect(() => {
    void run(async () => setItems(await api<WallDisplay[]>(base)));
  }, [base]);

  return (
    <div className="wall-displays">
      <p className="muted">
        Zeigt Uhr, Wetter, die Termine von heute und morgen, Raumklima und die Pinnwand – zum Anschauen, ohne Anmeldung.
        Läuft auch im Browser alter Tablets (z. B. Fire 7).
      </p>
      {items?.map((d) => (
        <div key={d.id} className="wall-display">
          <span className="wall-display-info">
            <strong>{d.name}</strong>
            <code className="wall-code">{dashed(d.token)}</code>
            <small className="muted">{d.last_seen_at ? `zuletzt aktiv ${formatTimestamp(d.last_seen_at)}` : 'noch nicht verbunden'}</small>
          </span>
          <button
            type="button"
            className="link-button danger-link"
            disabled={busy}
            onClick={() => confirm(`„${d.name}“ entfernen? Das Display zeigt danach nichts mehr an.`) &&
              void run(async () => {
                await api(`${base}/${d.id}`, { method: 'DELETE' });
                setItems(items.filter((i) => i.id !== d.id));
              })}
          >
            Entfernen
          </button>
        </div>
      ))}
      {items && items.length > 0 && (
        <small className="hint">Am Tablet im Browser <b>{address}</b> öffnen und den Code eintippen.</small>
      )}
      <form
        className="row align-end"
        onSubmit={(e) => {
          e.preventDefault();
          void run(async () => {
            const created = await api<WallDisplay>(base, { method: 'POST', body: { name } });
            setItems([...(items ?? []), created]);
            setName('');
          });
        }}
      >
        <label>Name<input value={name} onChange={(e) => setName(e.target.value)} placeholder="z. B. Küche" maxLength={50} /></label>
        <button className="button" disabled={busy}><Icon name="plus" size={18} /> Code erstellen</button>
      </form>
      {error && <p className="error">{error}</p>}
    </div>
  );
}

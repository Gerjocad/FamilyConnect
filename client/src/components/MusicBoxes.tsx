import { useEffect, useState } from 'react';
import { api, getServerUrl } from '../api';
import { formatTimestamp } from '../dates';
import { useFamily } from '../session';
import { Icon } from './Icon';
import { useAsync } from './useAsync';

interface MusicBox { id: number; name: string; token: string; created_at: string; last_seen_at: string | null }

/** Musik: Codes für Musik-Boxen (ESP32 mit Kartenleser) – kommen in die config.h der Box */
export function MusicBoxes() {
  const { family } = useFamily();
  const base = `/families/${family.id}/music-boxes`;
  const [items, setItems] = useState<MusicBox[] | null>(null);
  const [name, setName] = useState('');
  const { busy, error, run } = useAsync();
  const server = getServerUrl() || location.origin;

  useEffect(() => {
    void run(async () => setItems(await api<MusicBox[]>(base)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base]);

  return (
    <section className="card music-boxes">
      <h2>📦 Musik-Box</h2>
      <p className="muted">Für die selbstgebaute Box mit Kartenleser: Karte rein → Playlist läuft, Karte raus → Pause. Code und Adresse kommen in die Datei <code>config.h</code> der Box.</p>
      {items?.map((b) => (
        <div key={b.id} className="wall-display">
          <span className="wall-display-info">
            <strong>{b.name}</strong>
            <code className="wall-code">{b.token}</code>
            <small className="muted">{b.last_seen_at ? `zuletzt aktiv ${formatTimestamp(b.last_seen_at)}` : 'noch nicht verbunden'}</small>
          </span>
          <button type="button" className="link-button danger-link" disabled={busy}
            onClick={() => confirm(`„${b.name}“ entfernen? Die Box funktioniert danach nicht mehr.`) && void run(async () => {
              await api(`${base}/${b.id}`, { method: 'DELETE' });
              setItems(items.filter((i) => i.id !== b.id));
            })}>
            Entfernen
          </button>
        </div>
      ))}
      {items && items.length > 0 && (
        <small className="hint">In <code>config.h</code>: <code>SERVER_URL "{server}"</code> und <code>BOX_CODE "{items[0].token}"</code></small>
      )}
      <form className="row align-end" onSubmit={(e) => {
        e.preventDefault();
        void run(async () => {
          const created = await api<MusicBox>(base, { method: 'POST', body: { name } });
          setItems([...(items ?? []), created]);
          setName('');
        });
      }}>
        <label>Name<input value={name} onChange={(e) => setName(e.target.value)} placeholder="z. B. Kinderzimmer" maxLength={50} /></label>
        <button className="button" disabled={busy}><Icon name="plus" size={18} /> Code erstellen</button>
      </form>
      {error && <p className="error">{error}</p>}
    </section>
  );
}

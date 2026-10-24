import { useEffect, useState } from 'react';
import { api } from '../api';
import { formatTimestamp } from '../dates';
import { onLiveChange } from '../live';
import { useFamily } from '../session';
import { Icon } from './Icon';
import { useAsync } from './useAsync';

interface Sensor { present: boolean | null; lux: number | null; dark: boolean | null; at: string }
interface WallDisplay {
  id: number;
  name: string;
  token: string;
  created_at: string;
  last_seen_at: string | null;
  sleep_after: number;
  dark_lux: number;
  sensor: Sensor | null;
}

const dashed = (code: string) => code.replace(/(.{4})(?=.)/g, '$1-');
// gleiche Werte wie SLEEP_OPTIONS / DARK_LUX_OPTIONS in server/src/wall.js
const SLEEP_OPTIONS: [number, string][] = [[0, 'nie'], [30, '30 Sekunden'], [60, '1 Minute'], [120, '2 Minuten'], [300, '5 Minuten'], [600, '10 Minuten']];
const DARK_LUX_OPTIONS: [number, string][] = [[5, 'sehr dunkel (5 Lux)'], [10, 'dunkel (10 Lux)'], [15, 'Dämmerung (15 Lux)'], [30, 'trüb (30 Lux)'], [50, 'Licht gedimmt (50 Lux)']];

/** Stand des Näherungs-/Lichtsensors neben dem Display */
function SensorStatus({ sensor }: { sensor: Sensor | null }) {
  if (!sensor) return <small className="muted">Kein Sensor verbunden – das Display bleibt an, Nachtfarben 22–6 Uhr.</small>;
  return (
    <span className="wall-sensor-status">
      {sensor.present !== null && <span className="chip">{sensor.present ? '👁 jemand da' : '💤 niemand da'}</span>}
      {sensor.lux !== null && <span className="chip">💡 {sensor.lux.toLocaleString('de-DE')} Lux</span>}
      {sensor.dark !== null && <span className="chip">{sensor.dark ? '🌙 Dark Mode' : '☀️ hell'}</span>}
    </span>
  );
}

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
    // Sensor-Änderungen still nachladen (ohne die Auswahlfelder kurz zu sperren)
    return onLiveChange((resource) => resource === 'wall-sensor' &&
      void api<WallDisplay[]>(base).then(setItems, () => undefined));
  }, [base]);

  const change = (d: WallDisplay, body: Partial<Pick<WallDisplay, 'sleep_after' | 'dark_lux'>>) =>
    void run(async () => {
      const saved = await api<WallDisplay>(`${base}/${d.id}`, { method: 'PATCH', body });
      setItems((list) => list?.map((i) => (i.id === d.id ? saved : i)) ?? null);
    });

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
          <div className="wall-sensor">
            <SensorStatus sensor={d.sensor} />
            <div className="row">
              <label>
                Ruhemodus, wenn niemand da ist, nach
                <select value={d.sleep_after} disabled={busy} onChange={(e) => change(d, { sleep_after: Number(e.target.value) })}>
                  {SLEEP_OPTIONS.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
                </select>
              </label>
              <label>
                Dark Mode, wenn es dunkler ist als
                <select value={d.dark_lux} disabled={busy} onChange={(e) => change(d, { dark_lux: Number(e.target.value) })}>
                  {DARK_LUX_OPTIONS.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
                </select>
              </label>
            </div>
          </div>
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

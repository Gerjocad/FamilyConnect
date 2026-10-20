import { useEffect, useState } from 'react';
import { api } from '../api';
import type { TuyaDevice } from '../climate';
import { useFamily } from '../session';
import { Icon } from './Icon';
import { useAsync } from './useAsync';

type Editable = Pick<TuyaDevice, 'id' | 'selected' | 'label' | 'min_temp' | 'max_temp' | 'min_humidity' | 'max_humidity'> & { name: string; online: boolean };

/** Falls Tuya keine Geräteliste liefert: Thermometer über seine Geräte-ID von Hand eintragen */
function ManualDevice({ error, path }: { error: string; path: string }) {
  const [id, setId] = useState('');
  const [label, setLabel] = useState('');
  const [maxHumidity, setMaxHumidity] = useState('');
  const [saved, setSaved] = useState(false);
  const { busy, error: saveError, run } = useAsync();
  return (
    <div className="climate-settings">
      <p className="error">{error}</p>
      <p className="muted">
        Die Geräteliste kommt gerade nicht von Tuya. Du kannst das Thermometer trotzdem eintragen: Auf platform.tuya.com
        im Projekt unter <b>Devices</b> steht die <b>Device ID</b>.
      </p>
      <label>Device ID<input value={id} onChange={(e) => setId(e.target.value.trim())} placeholder="z. B. bf12ab34cd56ef78gh90ij" /></label>
      <label>Name in der App<input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="z. B. Kinderzimmer" maxLength={50} /></label>
      <label>Max. % Feuchte <span className="hint">(optional, für Warnungen)</span><input type="number" value={maxHumidity} onChange={(e) => setMaxHumidity(e.target.value)} /></label>
      {saveError && <p className="error">{saveError}</p>}
      {saved && <p className="success">Gespeichert – die Werte erscheinen auf der Übersicht.</p>}
      {id && <DeviceTest path={path} id={id} />}
      <button className="button primary" disabled={busy || !id} onClick={() => void run(async () => {
        await api(path, { method: 'PUT', body: { devices: [{ id, label, max_humidity: maxHumidity === '' ? null : Number(maxHumidity) }] } });
        setSaved(true);
      })}>
        <Icon name="check" size={18} /> Thermometer speichern
      </button>
    </div>
  );
}

interface Diagnosis {
  source: string | null;
  points: { code: string; value: unknown }[];
  errors: string[];
  parsed: { temperature: number | null; humidity: number | null; battery: number | null };
}

const show = (v: number | null, unit: string) => (v === null ? '–' : `${String(v).replace('.', ',')} ${unit}`);

/** „Werte testen“: zeigt, was das Thermometer an Tuya meldet und was die App daraus liest */
function DeviceTest({ path, id }: { path: string; id: string }) {
  const [result, setResult] = useState<Diagnosis | null>(null);
  const { busy, error, run } = useAsync();
  return (
    <div className="climate-test">
      <button type="button" className="button small" disabled={busy} onClick={() => void run(async () => setResult(await api<Diagnosis>(`${path}/${encodeURIComponent(id)}/test`)))}>
        <Icon name="thermometer" size={16} /> {busy ? 'Frage ab …' : 'Werte testen'}
      </button>
      {error && <p className="error">{error}</p>}
      {result && (
        <>
          <p>
            Temperatur <b>{show(result.parsed.temperature, '°C')}</b> · Feuchte <b>{show(result.parsed.humidity, '%')}</b> · Batterie <b>{show(result.parsed.battery, '%')}</b>
          </p>
          {result.points.length > 0 ? (
            <ul className="climate-raw">
              {result.points.map((p) => <li key={p.code}><code>{p.code}</code> = {JSON.stringify(p.value)}</li>)}
            </ul>
          ) : (
            <p className="error">
              Tuya liefert für dieses Gerät keine Werte. Meist hilft: auf platform.tuya.com im Projekt unter <b>Devices</b> beim
              Gerät den <b>Control Instruction Mode</b> auf <b>DP Instruction</b> stellen, ein paar Minuten warten und erneut testen.
            </p>
          )}
          {result.errors.length > 0 && (
            <details>
              <summary className="muted">Abfragen ohne Ergebnis ({result.errors.length})</summary>
              <ul className="climate-raw">{result.errors.map((e) => <li key={e}>{e}</li>)}</ul>
            </details>
          )}
        </>
      )}
    </div>
  );
}

/** Admin: welche Tuya-Thermometer die Familie sieht, mit Namen und Grenzwerten für Warnungen */
export function ClimateSettings() {
  const { family } = useFamily();
  const path = `/families/${family.id}/climate/devices`;
  const [state, setState] = useState<{ enabled: boolean; devices: Editable[] } | null>(null);
  const [saved, setSaved] = useState(false);
  const load = useAsync();
  const save = useAsync();

  // Nur beim Öffnen bzw. Familienwechsel laden
  useEffect(() => {
    void load.run(async () => setState(await api(path)));
  }, [path]);

  if (load.error) return <ManualDevice error={load.error} path={path} />;
  if (!state) return <p className="muted">Lade Thermometer …</p>;
  if (!state.enabled) {
    return <p className="muted">Die Tuya-Zugangsdaten fehlen noch auf dem Server – siehe Anleitung deploy/TUYA.md.</p>;
  }

  const update = (id: string, patch: Partial<Editable>) => {
    setSaved(false);
    setState({ ...state, devices: state.devices.map((d) => (d.id === id ? { ...d, ...patch } : d)) });
  };
  const numberField = (d: Editable, key: 'min_temp' | 'max_temp' | 'min_humidity' | 'max_humidity', label: string) => (
    <label>
      {label}
      <input
        type="number"
        inputMode="decimal"
        step="0.5"
        value={d[key] ?? ''}
        onChange={(e) => update(d.id, { [key]: e.target.value === '' ? null : Number(e.target.value) })}
      />
    </label>
  );

  return (
    <div className="climate-settings">
      {state.devices.length === 0 && <p className="muted">Im Tuya-Projekt sind keine Geräte verknüpft.</p>}
      {state.devices.map((d) => (
        <div key={d.id} className={`climate-device ${d.selected ? 'selected' : ''}`}>
          <label className="checkbox">
            <input type="checkbox" checked={d.selected} onChange={(e) => update(d.id, { selected: e.target.checked })} />
            <span>{d.name} {!d.online && <small className="muted">(offline)</small>}</span>
          </label>
          {d.selected && (
            <>
              <label>Name in der App<input value={d.label} onChange={(e) => update(d.id, { label: e.target.value })} placeholder="z. B. Kinderzimmer" maxLength={50} /></label>
              <div className="row">
                {numberField(d, 'min_temp', 'Min. °C')}
                {numberField(d, 'max_temp', 'Max. °C')}
              </div>
              <div className="row">
                {numberField(d, 'min_humidity', 'Min. % Feuchte')}
                {numberField(d, 'max_humidity', 'Max. % Feuchte')}
              </div>
              <DeviceTest path={path} id={d.id} />
            </>
          )}
        </div>
      ))}
      <small className="hint">Liegt ein Wert außerhalb, bekommen Eltern eine Push-Nachricht (geprüft alle 10 Minuten). Leere Felder = keine Warnung.</small>
      {save.error && <p className="error">{save.error}</p>}
      {saved && <p className="success">Gespeichert</p>}
      <button
        className="button primary"
        disabled={save.busy}
        onClick={() => void save.run(async () => {
          await api(path, { method: 'PUT', body: { devices: state.devices.filter((d) => d.selected) } });
          setSaved(true);
        })}
      >
        <Icon name="check" size={18} /> Thermometer speichern
      </button>
    </div>
  );
}

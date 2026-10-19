import { useEffect, useState } from 'react';
import { api } from '../api';
import type { TuyaDevice } from '../climate';
import { useFamily } from '../session';
import { Icon } from './Icon';
import { useAsync } from './useAsync';

type Editable = Pick<TuyaDevice, 'id' | 'selected' | 'label' | 'min_temp' | 'max_temp' | 'min_humidity' | 'max_humidity'> & { name: string; online: boolean };

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

  if (load.error) return <p className="error">{load.error}</p>;
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

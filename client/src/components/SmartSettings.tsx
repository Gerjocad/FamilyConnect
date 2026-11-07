import { useEffect, useState } from 'react';
import { api } from '../api';
import type { SmartSetupDevice } from '../smart';
import { useFamily } from '../session';
import { Icon } from './Icon';
import { useAsync } from './useAsync';

/** Admin: welche Tuya-Lampen und -Steckdosen unter „Smart Home“ erscheinen und welche Kinder schalten dürfen */
export function SmartSettings() {
  const { family } = useFamily();
  const path = `/families/${family.id}/smart/devices`;
  const [state, setState] = useState<{ enabled: boolean; devices: SmartSetupDevice[] } | null>(null);
  const [saved, setSaved] = useState(false);
  const load = useAsync();
  const save = useAsync();

  useEffect(() => {
    void load.run(async () => setState(await api(path)));
  }, [path]);

  if (load.error) return <p className="error">{load.error}</p>;
  if (!state) return <p className="muted">Lade Lampen und Steckdosen …</p>;
  if (!state.enabled) return <p className="muted">Die Tuya-Zugangsdaten fehlen noch auf dem Server – siehe Anleitung deploy/TUYA.md.</p>;

  const update = (id: string, patch: Partial<SmartSetupDevice>) => {
    setSaved(false);
    setState({ ...state, devices: state.devices.map((d) => (d.id === id ? { ...d, ...patch } : d)) });
  };

  return (
    <div className="climate-settings">
      {state.devices.length === 0 && (
        <p className="muted">Im Tuya-Projekt sind keine Lampen oder Steckdosen. Neue Geräte zuerst in der Smart-Life-App hinzufügen – sie erscheinen hier nach ein paar Minuten.</p>
      )}
      {state.devices.map((d) => (
        <div key={d.id} className={`climate-device ${d.selected ? 'selected' : ''}`}>
          <label className="checkbox">
            <input type="checkbox" checked={d.selected} onChange={(e) => update(d.id, { selected: e.target.checked })} />
            <span>{d.kind === 'light' ? '💡' : '🔌'} {d.name} {!d.online && <small className="muted">(offline)</small>}</span>
          </label>
          {d.selected && (
            <>
              <label>Name in der App<input value={d.label} onChange={(e) => update(d.id, { label: e.target.value })} placeholder="z. B. Kinderzimmer Licht" maxLength={50} /></label>
              <div className="row">
                <label>Art
                  <select value={d.kind} onChange={(e) => update(d.id, { kind: e.target.value as SmartSetupDevice['kind'] })}>
                    <option value="light">💡 Lampe</option>
                    <option value="plug">🔌 Steckdose</option>
                  </select>
                </label>
                <label className="checkbox"><input type="checkbox" checked={d.kids_allowed} onChange={(e) => update(d.id, { kids_allowed: e.target.checked })} /> Kinder dürfen schalten</label>
              </div>
            </>
          )}
        </div>
      ))}
      <small className="hint">Eltern und Admins schalten alle ausgewählten Geräte, Kinder nur die freigegebenen.</small>
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
        <Icon name="check" size={18} /> Geräte speichern
      </button>
    </div>
  );
}

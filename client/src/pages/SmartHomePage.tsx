import { useState } from 'react';
import { EmptyState } from '../components/EmptyState';
import { useAsync } from '../components/useAsync';
import { usePermissions } from '../permissions';
import { useFamily } from '../session';
import { switchDevice, useSmartDevices, type SmartDevice } from '../smart';

function DeviceCard({ device, onChange }: { device: SmartDevice; onChange(patch: Partial<SmartDevice>): void }) {
  const { family } = useFamily();
  const { busy, error, run } = useAsync();
  const [level, setLevel] = useState<number | null>(null);
  const on = device.on === true;
  const icon = device.kind === 'light' ? '💡' : '🔌';

  const toggle = () => void run(async () => {
    await switchDevice(family.id, device.device_id, { on: !on });
    onChange({ on: !on });
  });
  const dim = (value: number) => void run(async () => {
    await switchDevice(family.id, device.device_id, { brightness: value, ...(!on && { on: true }) });
    onChange({ brightness: value, on: true });
    setLevel(null);
  });

  return (
    <li className={`card smart-device ${device.kind} ${on ? 'on' : ''} ${device.error ? 'offline' : ''}`}>
      <button type="button" className="smart-toggle" disabled={busy || device.on === null} onClick={toggle} aria-pressed={on}>
        <span className="smart-icon" aria-hidden>{icon}</span>
        <span className="smart-text">
          <strong>{device.label || (device.kind === 'light' ? 'Lampe' : 'Steckdose')}</strong>
          <small>{device.error ? 'nicht erreichbar' : busy ? 'schalte …' : on ? `an${device.brightness !== null ? ` · ${device.brightness} %` : ''}` : 'aus'}</small>
        </span>
        <span className={`smart-pill ${on ? 'on' : ''}`} aria-hidden><span /></span>
      </button>
      {device.dimmable && !device.error && (
        <label className="smart-dim">
          <span aria-hidden>🔅</span>
          <input
            type="range"
            min={1}
            max={100}
            value={level ?? device.brightness ?? 50}
            disabled={busy}
            onChange={(e) => setLevel(Number(e.target.value))}
            onPointerUp={(e) => dim(Number((e.target as HTMLInputElement).value))}
            onKeyUp={(e) => dim(Number((e.target as HTMLInputElement).value))}
            aria-label="Helligkeit"
          />
          <span aria-hidden>🔆</span>
        </label>
      )}
      {(error || device.error) && <p className="error small">{error ?? device.error}</p>}
    </li>
  );
}

/** Smart Home: Lampen und Steckdosen schalten */
export function SmartHomePage() {
  const { family } = useFamily();
  const { isAdmin } = usePermissions();
  const { data, error, setData } = useSmartDevices();
  const all = useAsync();

  const patch = (id: string, p: Partial<SmartDevice>) =>
    setData((d) => d && { ...d, devices: d.devices.map((x) => (x.device_id === id ? { ...x, ...p } : x)) });

  const devices = data?.devices ?? [];
  const lights = devices.filter((d) => d.kind === 'light');
  const plugs = devices.filter((d) => d.kind === 'plug');
  const lightsOn = lights.filter((d) => d.on);

  const allLightsOff = () => void all.run(async () => {
    await Promise.all(lightsOn.map((d) => switchDevice(family.id, d.device_id, { on: false })));
    for (const d of lightsOn) patch(d.device_id, { on: false });
  });

  return (
    <div className="page">
      <header className="page-header">
        <h1>Smart Home</h1>
        {lightsOn.length > 0 && (
          <button type="button" className="button" disabled={all.busy} onClick={allLightsOff}>
            🌙 {all.busy ? 'Schalte aus …' : `Alle Lichter aus (${lightsOn.length})`}
          </button>
        )}
      </header>
      {error && <p className="error">{error}</p>}
      {all.error && <p className="error">{all.error}</p>}
      {!data && !error && <p className="muted">Frage die Geräte ab …</p>}
      {data && !data.enabled && <EmptyState icon="bulb" title="Smart Home ist noch nicht eingerichtet">Die Tuya-Zugangsdaten fehlen auf dem Server.</EmptyState>}
      {data?.enabled && devices.length === 0 && (
        <EmptyState icon="bulb" title="Noch keine Geräte">
          {isAdmin ? 'Unter Familie & Profil → Geräte → Lampen & Steckdosen auswählen, welche hier erscheinen.' : 'Ein Admin kann unter Familie & Profil Lampen und Steckdosen auswählen.'}
        </EmptyState>
      )}
      {lights.length > 0 && (
        <section>
          <h2 className="smart-heading">Lampen</h2>
          <ul className="smart-grid">{lights.map((d) => <DeviceCard key={d.device_id} device={d} onChange={(p) => patch(d.device_id, p)} />)}</ul>
        </section>
      )}
      {plugs.length > 0 && (
        <section>
          <h2 className="smart-heading">Steckdosen</h2>
          <ul className="smart-grid">{plugs.map((d) => <DeviceCard key={d.device_id} device={d} onChange={(p) => patch(d.device_id, p)} />)}</ul>
        </section>
      )}
    </div>
  );
}

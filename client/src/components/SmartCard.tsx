import { NavCard } from './NavCard';
import { Icon } from './Icon';
import { useFamily } from '../session';
import { switchDevice, useSmartDevices } from '../smart';

/** Übersicht: Lampen und Steckdosen mit einem Tipp schalten (nur wenn welche eingerichtet sind) */
export function SmartCard() {
  const { family } = useFamily();
  const { data, setData } = useSmartDevices();
  const devices = data?.devices.filter((d) => d.on !== null) ?? [];
  if (!devices.length) return null;
  const toggle = async (id: string, on: boolean) => {
    setData((d) => d && { ...d, devices: d.devices.map((x) => (x.device_id === id ? { ...x, on } : x)) });
    try {
      await switchDevice(family.id, id, { on });
    } catch {
      setData((d) => d && { ...d, devices: d.devices.map((x) => (x.device_id === id ? { ...x, on: !on } : x)) });
    }
  };
  return (
    <NavCard to="/smarthome" className="smart-card">
      <header className="section-header">
        <h2><Icon name="bulb" size={18} /> Smart Home</h2>
        <span className="spacer" />
        <span className="nav-card-chevron" aria-hidden="true"><Icon name="right" size={18} /></span>
      </header>
      <div className="smart-chips">
        {devices.map((d) => (
          <button key={d.device_id} type="button" className={`smart-chip ${d.on ? 'on' : ''}`} onClick={() => void toggle(d.device_id, !d.on)} aria-pressed={Boolean(d.on)}>
            {d.kind === 'light' ? '💡' : '🔌'} {d.label || (d.kind === 'light' ? 'Lampe' : 'Steckdose')}
          </button>
        ))}
      </div>
    </NavCard>
  );
}

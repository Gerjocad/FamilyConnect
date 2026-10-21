import { useState, type ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

/** Aufklappbarer Bereich auf „Familie & Profil“; #id in der Adresse öffnet ihn direkt (z. B. aus einer Benachrichtigung) */
export function SettingsGroup({ id, icon, title, summary, children }: {
  id: string;
  icon: IconName;
  title: string;
  summary?: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(() => location.hash === `#${id}`);
  return (
    <section className={`card settings-group ${open ? 'open' : ''}`} id={id}>
      <button type="button" className="settings-group-head" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="settings-group-icon"><Icon name={icon} size={20} /></span>
        <span className="settings-group-title">
          <strong>{title}</strong>
          {summary && <small className="muted">{summary}</small>}
        </span>
        <Icon name="right" size={18} />
      </button>
      {open && <div className="settings-group-body">{children}</div>}
    </section>
  );
}

import { NavLink, Outlet } from 'react-router';
import { useFamily } from '../session';
import { Avatar } from './Avatar';
import { Icon, type IconName } from './Icon';
import { NotificationBridge } from './NotificationBridge';

const NAV: { to: string; label: string; icon: IconName; mobile: boolean }[] = [
  { to: '/', label: 'Übersicht', icon: 'home', mobile: true },
  { to: '/kalender', label: 'Kalender', icon: 'calendar', mobile: true },
  { to: '/listen', label: 'Listen', icon: 'list', mobile: true },
  { to: '/aufgaben', label: 'Aufgaben', icon: 'task', mobile: true },
  { to: '/pinnwand', label: 'Pinnwand', icon: 'chat', mobile: true },
  { to: '/gewohnheiten', label: 'Gewohnheiten', icon: 'habit', mobile: false },
  { to: '/essen', label: 'Essensplan', icon: 'meal', mobile: false },
  { to: '/kontakte', label: 'Kontakte', icon: 'contacts', mobile: false },
  { to: '/einstellungen', label: 'Familie & Profil', icon: 'settings', mobile: false },
];

export function Layout() {
  const { family, user, selectFamily } = useFamily();

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <img src="/icon.svg" alt="" width={32} height={32} />
          <span>FamilyConnect</span>
        </div>
        {user.families.length > 1 ? (
          <select
            className="family-switch"
            value={family.id}
            onChange={(e) => selectFamily(Number(e.target.value))}
            aria-label="Familie wechseln"
          >
            {user.families.map((f) => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </select>
        ) : (
          <div className="family-name">{family.name}</div>
        )}
        <nav>
          {NAV.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.to === '/'} className="nav-link">
              <Icon name={item.icon} />
              {item.label}
            </NavLink>
          ))}
        </nav>
        <NavLink to="/einstellungen" className="sidebar-user">
          <Avatar member={user} size={28} />
          <span>{user.name}</span>
        </NavLink>
      </aside>

      <header className="topbar">
        <img src="/icon.svg" alt="" width={28} height={28} />
        <strong>{family.name}</strong>
        <span className="spacer" />
        <NavLink to="/gewohnheiten" className="icon-button" aria-label="Gewohnheiten"><Icon name="habit" /></NavLink>
        <NavLink to="/essen" className="icon-button" aria-label="Essensplan"><Icon name="meal" /></NavLink>
        <NavLink to="/kontakte" className="icon-button" aria-label="Kontakte"><Icon name="contacts" /></NavLink>
        <NavLink to="/einstellungen" aria-label="Familie & Profil"><Avatar member={user} size={30} /></NavLink>
      </header>

      <main className="content">
        <Outlet />
      </main>
      <NotificationBridge />

      <nav className="bottombar">
        {NAV.filter((n) => n.mobile).map((item) => (
          <NavLink key={item.to} to={item.to} end={item.to === '/'} className="bottom-link">
            <Icon name={item.icon} size={22} />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

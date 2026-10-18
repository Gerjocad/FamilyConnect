import { useEffect } from 'react';
import { Logo } from './Logo';
import { NavLink, Outlet, useLocation } from 'react-router';
import { useFamily } from '../session';
import { Avatar } from './Avatar';
import { Icon, type IconName } from './Icon';
import { NotificationBridge } from './NotificationBridge';
import { UpdateBanner } from './UpdateBanner';

const NAV: { to: string; label: string; icon: IconName; mobile: boolean }[] = [
  { to: '/', label: 'Übersicht', icon: 'home', mobile: true },
  { to: '/kalender', label: 'Kalender', icon: 'calendar', mobile: true },
  { to: '/listen', label: 'Listen', icon: 'list', mobile: true },
  { to: '/aufgaben', label: 'Aufgaben', icon: 'task', mobile: true },
  { to: '/pinnwand', label: 'Pinnwand', icon: 'chat', mobile: true },
  { to: '/gewohnheiten', label: 'Gewohnheiten', icon: 'habit', mobile: false },
  { to: '/essen', label: 'Essensplan', icon: 'meal', mobile: false },
  { to: '/rezepte', label: 'Rezepte', icon: 'recipe', mobile: false },
  { to: '/kontakte', label: 'Kontakte', icon: 'contacts', mobile: false },
  { to: '/feedback', label: 'Feedback', icon: 'feedback', mobile: false },
  { to: '/einstellungen', label: 'Familie & Profil', icon: 'settings', mobile: false },
];

// Untere Leiste auf dem Handy: je zwei Bereiche links und rechts, die Übersicht rund in der Mitte
const MOBILE_LEFT = NAV.filter((n) => ['/kalender', '/listen'].includes(n.to));
const MOBILE_RIGHT = NAV.filter((n) => ['/aufgaben', '/pinnwand'].includes(n.to));

export function Layout() {
  const { family, user, selectFamily } = useFamily();
  const { pathname } = useLocation();

  // Neue Seite immer von oben anzeigen
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <Logo size={32} />
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
        <Logo size={28} />
        <strong>{family.name}</strong>
        <span className="spacer" />
        <NavLink to="/gewohnheiten" className="icon-button" aria-label="Gewohnheiten"><Icon name="habit" /></NavLink>
        <NavLink to="/essen" className="icon-button" aria-label="Essensplan"><Icon name="meal" /></NavLink>
        <NavLink to="/rezepte" className="icon-button" aria-label="Rezepte"><Icon name="recipe" /></NavLink>
        <NavLink to="/kontakte" className="icon-button" aria-label="Kontakte"><Icon name="contacts" /></NavLink>
        <NavLink to="/feedback" className="icon-button" aria-label="Feedback"><Icon name="feedback" /></NavLink>
        <NavLink to="/einstellungen" aria-label="Familie & Profil"><Avatar member={user} size={30} /></NavLink>
      </header>

      <main className="content">
        <UpdateBanner />
        <Outlet />
      </main>
      <NotificationBridge />

      <nav className="bottombar">
        {MOBILE_LEFT.map((item) => (
          <NavLink key={item.to} to={item.to} className="bottom-link">
            <Icon name={item.icon} size={22} />
            <span>{item.label}</span>
          </NavLink>
        ))}
        <NavLink to="/" end className="bottom-home" aria-label="Übersicht">
          <Icon name="home" size={28} />
        </NavLink>
        {MOBILE_RIGHT.map((item) => (
          <NavLink key={item.to} to={item.to} className="bottom-link">
            <Icon name={item.icon} size={22} />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

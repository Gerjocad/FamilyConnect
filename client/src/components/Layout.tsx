import { useEffect, useRef, useState } from 'react';
import { Logo } from './Logo';
import { NavLink, Outlet, useLocation } from 'react-router';
import { useComplaints } from '../pages/ComplaintsPage';
import { useRequests } from '../pages/RequestsPage';
import { useFeatures } from '../features';
import { useFamily } from '../session';
import { Avatar } from './Avatar';
import { CLOSE_DRAWER_EVENT } from './drawer';
import { Icon, type IconName } from './Icon';
import { NotificationBridge } from './NotificationBridge';
import { GeofenceBridge } from './GeofenceBridge';
import { UpdateBanner } from './UpdateBanner';
import { TOPBAR_ACTIONS_ID } from './TopbarActions';
import { ActivityBell } from './ActivityBell';

const NAV: { to: string; label: string; icon: IconName; feature?: 'points' }[] = [
  { to: '/', label: 'Übersicht', icon: 'home' },
  { to: '/kalender', label: 'Kalender', icon: 'calendar' },
  { to: '/listen', label: 'Listen', icon: 'list' },
  { to: '/aufgaben', label: 'Aufgaben', icon: 'task' },
  { to: '/pinnwand', label: 'Pinnwand', icon: 'chat' },
  { to: '/gewohnheiten', label: 'Gewohnheiten', icon: 'habit' },
  { to: '/dienste', label: 'Dienste', icon: 'chore' },
  { to: '/punkte', label: 'Punkte', icon: 'star', feature: 'points' },
  { to: '/spiele', label: 'Spiele', icon: 'game' },
  { to: '/essen', label: 'Essensplan', icon: 'meal' },
  { to: '/rezepte', label: 'Rezepte', icon: 'recipe' },
  { to: '/kontakte', label: 'Kontakte', icon: 'contacts' },
  { to: '/geburtstage', label: 'Geburtstage', icon: 'cake' },
  { to: '/wuensche', label: 'Wünsche', icon: 'gift' },
  { to: '/ausgeliehen', label: 'Ausgeliehen', icon: 'book' },
  { to: '/musik', label: 'Musik', icon: 'music' },
  { to: '/anfragen', label: 'Anfragen', icon: 'request' },
  { to: '/beschwerden', label: 'Beschwerden', icon: 'complaint' },
  { to: '/feedback', label: 'Feedback', icon: 'feedback' },
  { to: '/einstellungen', label: 'Familie & Profil', icon: 'settings' },
];

// Untere Leiste auf dem Handy: je zwei Bereiche links und rechts, die Übersicht rund in der Mitte
const MOBILE_LEFT = NAV.filter((n) => ['/kalender', '/listen'].includes(n.to));
const MOBILE_RIGHT = NAV.filter((n) => ['/aufgaben', '/pinnwand'].includes(n.to));

// Wischen von links öffnet die Leiste; ganz am Rand fängt Android die Zurück-Geste ab, daher bis 80 px
const EDGE = 80;
const SWIPE = 50;

/** Seitenleiste auf dem Handy: von links reinziehen bzw. nach links wegwischen */
function useDrawerSwipe(open: boolean, setOpen: (open: boolean) => void) {
  const start = useRef<{ x: number; y: number } | null>(null);
  useEffect(() => {
    const onStart = (e: TouchEvent) => {
      const t = e.touches[0];
      // Nicht in waagerecht scrollbaren Bereichen (z. B. Filter-Chips), nicht im Monatskalender (dort wechselt Wischen
      // den Monat) und nur auf dem Handy-Layout
      const scrollable = (e.target as HTMLElement).closest('.filter-bar, .segmented, .month-grid, input, textarea, select');
      start.current = window.innerWidth < 900 && !scrollable && (open || t.clientX < EDGE) ? { x: t.clientX, y: t.clientY } : null;
    };
    const onEnd = (e: TouchEvent) => {
      if (!start.current) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - start.current.x;
      const dy = Math.abs(t.clientY - start.current.y);
      start.current = null;
      if (dy > Math.abs(dx)) return; // eher gescrollt als gewischt
      if (!open && dx > SWIPE) setOpen(true);
      if (open && dx < -SWIPE) setOpen(false);
    };
    document.addEventListener('touchstart', onStart, { passive: true });
    document.addEventListener('touchend', onEnd, { passive: true });
    return () => {
      document.removeEventListener('touchstart', onStart);
      document.removeEventListener('touchend', onEnd);
    };
  }, [open, setOpen]);
}

export function Layout() {
  const { family, user, selectFamily } = useFamily();
  const features = useFeatures();
  const { pathname } = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);
  // Ab 900 px gibt es statt der oberen Leiste die Seitenleiste – die Glocke wandert mit
  const [wide, setWide] = useState(() => matchMedia('(min-width: 900px)').matches);
  useEffect(() => {
    const query = matchMedia('(min-width: 900px)');
    const update = () => setWide(query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  const complaints = useComplaints();
  const openComplaints = complaints.items.filter((c) => c.recipient_id === user.id && c.status === 'open').length;
  const requests = useRequests();
  const badges: Record<string, number> = { '/beschwerden': openComplaints, '/anfragen': requests.needsMe.length };
  useDrawerSwipe(drawerOpen, setDrawerOpen);

  // Nach dem Antippen eines Menüpunkts schließen
  useEffect(() => setDrawerOpen(false), [pathname]);

  useEffect(() => {
    const close = () => setDrawerOpen(false);
    window.addEventListener(CLOSE_DRAWER_EVENT, close);
    return () => window.removeEventListener(CLOSE_DRAWER_EVENT, close);
  }, []);

  // Neue Seite immer von oben anzeigen
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return (
    <div className={`shell ${drawerOpen ? 'drawer-open' : ''}`}>
      <div className="drawer-backdrop" onClick={() => setDrawerOpen(false)} aria-hidden="true" />
      <aside className="sidebar" aria-label="Menü">
        <div className="brand">
          <Logo size={32} />
          <span>FamilyConnect</span>
          <span className="spacer" />
          {wide && <ActivityBell />}
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
          {NAV.filter((item) => !item.feature || features[item.feature]).map((item) => (
            <NavLink key={item.to} to={item.to} end={item.to === '/'} className="nav-link">
              <Icon name={item.icon} />
              {item.label}
              {badges[item.to] > 0 && <span className="badge nav-badge">{badges[item.to]}</span>}
            </NavLink>
          ))}
        </nav>
        <NavLink to="/einstellungen" className="sidebar-user">
          <Avatar member={user} size={28} />
          <span>{user.name}</span>
        </NavLink>
      </aside>

      <header className="topbar">
        <button className="icon-button menu-button" onClick={() => setDrawerOpen(true)} aria-label="Menü öffnen" aria-expanded={drawerOpen}>
          <Icon name="menu" />
          {(openComplaints > 0 || requests.needsMe.length > 0) && <span className="menu-dot" aria-hidden="true" />}
        </button>
        <Logo size={28} />
        <strong>{family.name}</strong>
        <span className="spacer" />
        <span id={TOPBAR_ACTIONS_ID} className="topbar-actions" />
        {!wide && <ActivityBell />}
        <NavLink to="/einstellungen" aria-label="Familie & Profil"><Avatar member={user} size={30} /></NavLink>
      </header>

      <main className="content">
        <UpdateBanner />
        <Outlet />
      </main>
      <NotificationBridge />
      <GeofenceBridge />

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

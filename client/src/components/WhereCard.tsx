import { formatShortDay, formatTime, sameDay } from '../dates';
import { usePlaces } from '../places';
import { useFamily } from '../session';
import { Avatar } from './Avatar';
import { Icon } from './Icon';
import { NavCard } from './NavCard';

/** „seit 7:52“ bzw. „seit gestern 18:10“ – Zeiten vom Server sind UTC (YYYY-MM-DD HH:MM:SS) */
function since(sql: string) {
  const d = new Date(`${sql.replace(' ', 'T')}Z`);
  const now = new Date();
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  const day = sameDay(d, now) ? '' : sameDay(d, yesterday) ? 'gestern ' : `${formatShortDay(d)} `;
  return `${day}${formatTime(d)}`;
}

/** Übersicht: wer gerade wo ist (nur wer sein Ankommen teilt) */
export function WhereCard() {
  const { member } = useFamily();
  const { data } = usePlaces();
  if (!data) return null;
  const place = (id: number) => data.places.find((p) => p.id === id);
  const rows = [
    ...data.presence.map((p) => ({ ...p, here: true })),
    ...data.away.map((p) => ({ ...p, here: false })),
  ].filter((r) => member(r.user_id) && place(r.place_id));
  if (rows.length === 0) return null;

  return (
    <NavCard to="/einstellungen#orte" className="span-2 where-card">
      <header className="section-header">
        <h2><Icon name="pin" size={18} /> Wo ist wer?</h2>
      </header>
      <ul className="where-list">
        {rows.map((r) => {
          const m = member(r.user_id)!;
          const p = place(r.place_id)!;
          return (
            <li key={r.user_id} className={`where-row ${r.here ? 'here' : 'away'}`}>
              <Avatar member={m} size={34} />
              <span className="where-text">
                <strong>{m.name.split(' ')[0]}</strong>
                <small>
                  {r.here ? <>{p.icon} {p.name} · seit {since(r.changed_at)}</> : <>unterwegs seit {since(r.changed_at)} · von {p.icon} {p.name}</>}
                </small>
              </span>
              <span className="where-badge" aria-hidden>{r.here ? p.icon : '🚶'}</span>
            </li>
          );
        })}
      </ul>
    </NavCard>
  );
}

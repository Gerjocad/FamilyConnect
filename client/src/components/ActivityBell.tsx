import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { useActivity, type ActivityItem } from '../activity';
import { formatShortDay, formatTime, formatTimestamp, parseLocal } from '../dates';
import { useFamily } from '../session';
import { Avatar } from './Avatar';
import { Icon } from './Icon';

const ANSWERS: Record<string, string> = { approved: 'angenommen', declined: 'abgelehnt', countered: 'mit Gegenvorschlag beantwortet' };

function describe(item: ActivityItem, name: string): { title: string; text: string } {
  switch (item.kind) {
    case 'comment': return { title: `${name} hat „${item.subject}“ kommentiert`, text: item.text };
    case 'event': {
      const start = parseLocal(item.text);
      const when = `${formatShortDay(start)}${item.text.length > 10 && !item.text.endsWith('T00:00') ? `, ${formatTime(start)}` : ''}`;
      return { title: `${name} hat dich bei „${item.subject}“ eingetragen`, text: when };
    }
    case 'post': return { title: `${name} auf der Pinnwand`, text: item.text };
    case 'complaint': return { title: `Beschwerde von ${name}`, text: item.text };
    case 'complaint-comment': return { title: `${name} hat eine Beschwerde kommentiert`, text: item.text };
    case 'complaint-resolved': return { title: `${name} hat deine Beschwerde erledigt`, text: item.text || item.subject };
    case 'request': return { title: `Anfrage von ${name}: ${item.subject}`, text: item.text };
    case 'request-answer': {
      const [status, ...note] = item.text.split('|');
      return { title: `${name} hat „${item.subject}“ ${ANSWERS[status] ?? 'beantwortet'}`, text: note.join('|') };
    }
  }
}

/** Glocke oben neben dem Profil: Zahl = Neues von anderen, Antippen springt direkt hin */
export function ActivityBell() {
  const { member } = useFamily();
  const activity = useActivity();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  // Was beim Öffnen neu war, bleibt in der offenen Liste hervorgehoben
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const toggle = () => {
    if (!open) {
      setFresh(new Set(activity.items.filter(activity.isNew).map((i) => i.key)));
      if (activity.unread > 0) void activity.markSeen().catch(() => {});
    }
    setOpen(!open);
  };

  return (
    <div className="plus-menu activity" ref={ref}>
      <button
        className="icon-button activity-button"
        aria-label={activity.unread ? `Neuigkeiten (${activity.unread} neu)` : 'Neuigkeiten'}
        aria-expanded={open}
        onClick={toggle}
      >
        <Icon name="bell" size={22} />
        {activity.unread > 0 && <span className="activity-count">{activity.unread > 9 ? '9+' : activity.unread}</span>}
      </button>
      {open && (
        <div className="plus-menu-list activity-list" role="menu">
          <strong className="activity-head">Neuigkeiten</strong>
          {activity.items.length === 0 ? (
            <p className="muted activity-empty">Noch nichts Neues von den anderen.</p>
          ) : (
            activity.items.map((item) => {
              const who = item.user_id ? member(item.user_id) : undefined;
              const { title, text } = describe(item, who?.name.split(' ')[0] ?? 'Jemand');
              return (
                <button
                  key={item.key}
                  role="menuitem"
                  className={`activity-item ${fresh.has(item.key) ? 'is-new' : ''}`}
                  onClick={() => {
                    setOpen(false);
                    navigate(item.path);
                  }}
                >
                  {who ? <Avatar member={who} size={28} /> : <span className="avatar neutral" style={{ width: 28, height: 28 }}>?</span>}
                  <span className="activity-text">
                    <span className="activity-title">{title}</span>
                    {text && <small className="activity-snippet">{text}</small>}
                    <small className="muted">{formatTimestamp(item.at)}</small>
                  </span>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

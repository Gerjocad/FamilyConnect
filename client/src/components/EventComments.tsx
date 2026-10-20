import { useState, type FormEvent } from 'react';
import { formatTimestamp } from '../dates';
import { useEventComments } from '../eventComments';
import { usePermissions } from '../permissions';
import { useFamily } from '../session';
import { Avatar } from './Avatar';
import { Icon } from './Icon';
import { useAsync } from './useAsync';

/** Kommentare zu einem Termin (bei Serien zum angeklickten Tag) – im Termin-Fenster */
export function EventComments({ eventId, date }: { eventId: number; date: string }) {
  const { user, member } = useFamily();
  const { isManager } = usePermissions();
  const comments = useEventComments();
  const [text, setText] = useState('');
  const { busy, error, run } = useAsync();
  const list = comments.items.filter((c) => c.event_id === eventId && c.date === date);

  const send = (e: FormEvent) => {
    e.preventDefault();
    const value = text.trim();
    if (!value) return;
    void run(async () => {
      await comments.add(eventId, date, value);
      setText('');
    });
  };

  return (
    <section className="event-comments">
      <h3><Icon name="chat" size={16} /> Kommentare{list.length > 0 && ` (${list.length})`}</h3>
      {list.length > 0 && (
        <ul className="comment-list">
          {list.map((c) => {
            const author = c.user_id ? member(c.user_id) : undefined;
            return (
              <li key={c.id} className="comment">
                {author ? <Avatar member={author} size={26} /> : <span className="avatar neutral" style={{ width: 26, height: 26 }}>?</span>}
                <div className="comment-body">
                  <small className="muted"><strong>{author?.name.split(' ')[0] ?? 'Ehemaliges Mitglied'}</strong> · {formatTimestamp(c.created_at)}</small>
                  <p>{c.text}</p>
                </div>
                {(c.user_id === user.id || isManager) && (
                  <button type="button" className="icon-button subtle" aria-label="Kommentar löschen" disabled={busy}
                    onClick={() => confirm('Kommentar löschen?') && void run(() => comments.remove(c.id))}>
                    <Icon name="trash" size={14} />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <form className="quick-add" onSubmit={send}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Kommentar schreiben …" aria-label="Kommentar" maxLength={1000} />
        <button className="button" disabled={busy || !text.trim()} aria-label="Kommentar senden"><Icon name="send" /></button>
      </form>
      {error && <p className="error">{error}</p>}
    </section>
  );
}

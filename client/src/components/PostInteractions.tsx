import { useState, type FormEvent } from 'react';
import { formatTimestamp } from '../dates';
import { usePermissions } from '../permissions';
import { REACTIONS, type PostExtras } from '../postExtras';
import { useFamily } from '../session';
import { Avatar } from './Avatar';
import { Icon } from './Icon';
import { useAsync } from './useAsync';

/** Unter einem Pinnwand-Beitrag: Reaktionen (8 Smileys) und Kommentare */
export function PostInteractions({ postId, extras, compact = false }: { postId: number; extras: PostExtras; compact?: boolean }) {
  const { user, member } = useFamily();
  const { isManager } = usePermissions();
  const [picking, setPicking] = useState(false);
  // null = automatisch (bis 3 Kommentare offen, auf der Übersicht zu)
  const [toggled, setToggled] = useState<boolean | null>(null);
  const [text, setText] = useState('');
  const { busy, error, run } = useAsync();
  const reactions = extras.reactionsFor(postId);
  const comments = extras.commentsFor(postId);
  const mine = reactions.find((r) => r.user_id === user.id)?.emoji ?? null;
  // Reaktionen gruppiert: ❤️ 2 · 😂 1
  const groups = REACTIONS.map((e) => ({ emoji: e, users: reactions.filter((r) => r.emoji === e).map((r) => r.user_id) })).filter((g) => g.users.length);
  const names = (ids: number[]) => ids.map((id) => (id === user.id ? 'Du' : member(id)?.name.split(' ')[0] ?? '?')).join(', ');
  const react = (emoji: string) => {
    setPicking(false);
    void run(() => extras.react(postId, user.id, mine === emoji ? null : emoji));
  };
  const send = (e: FormEvent) => {
    e.preventDefault();
    const value = text.trim();
    if (!value) return;
    void run(async () => {
      await extras.comment(postId, value);
      setText('');
    });
  };
  const showComments = toggled ?? (!compact && comments.length > 0 && comments.length <= 3);

  return (
    <div className="post-interactions">
      <div className="reaction-bar">
        {groups.map((g) => (
          <button key={g.emoji} type="button" className={`reaction-chip ${g.users.includes(user.id) ? 'mine' : ''}`} title={names(g.users)} aria-label={`${g.emoji} von ${names(g.users)}`} onClick={() => react(g.emoji)}>
            <span>{g.emoji}</span> <small>{g.users.length}</small>
          </button>
        ))}
        <button type="button" className={`reaction-add ${picking ? 'active' : ''}`} aria-label="Reagieren" aria-expanded={picking} onClick={() => setPicking(!picking)}>
          ☺<small>+</small>
        </button>
        <button type="button" className="comment-toggle" onClick={() => setToggled(!showComments)} aria-expanded={showComments}>
          <Icon name="chat" size={15} /> {comments.length > 0 ? `${comments.length} ${comments.length === 1 ? 'Kommentar' : 'Kommentare'}` : 'Kommentieren'}
        </button>
      </div>
      {picking && (
        <div className="reaction-picker" role="group" aria-label="Reaktion wählen">
          {REACTIONS.map((e) => (
            <button key={e} type="button" className={mine === e ? 'active' : ''} aria-pressed={mine === e} onClick={() => react(e)}>{e}</button>
          ))}
        </div>
      )}
      {showComments && (
        <div className="post-comments">
          {comments.map((c) => {
            const author = c.user_id ? member(c.user_id) : undefined;
            return (
              <div key={c.id} className="post-comment">
                {author ? <Avatar member={author} size={24} /> : <span className="avatar neutral" style={{ width: 24, height: 24 }}>?</span>}
                <div className="post-comment-bubble">
                  <small><strong>{c.user_id === user.id ? 'Du' : author?.name.split(' ')[0] ?? 'Ehemaliges Mitglied'}</strong> <span className="muted">· {formatTimestamp(c.created_at)}</span></small>
                  <p>{c.text}</p>
                </div>
                {(c.user_id === user.id || isManager) && (
                  <button type="button" className="icon-button subtle" aria-label="Kommentar löschen" disabled={busy}
                    onClick={() => confirm('Kommentar löschen?') && void run(() => extras.removeComment(c.id))}>
                    <Icon name="trash" size={14} />
                  </button>
                )}
              </div>
            );
          })}
          <form className="quick-add post-comment-form" onSubmit={send}>
            <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Kommentar schreiben …" aria-label="Kommentar" maxLength={1000} autoFocus={toggled === true && comments.length === 0} />
            <button className="button" disabled={busy || !text.trim()} aria-label="Kommentar senden"><Icon name="send" /></button>
          </form>
        </div>
      )}
      {error && <p className="error">{error}</p>}
    </div>
  );
}

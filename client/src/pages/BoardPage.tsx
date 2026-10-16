import { useState, type FormEvent } from 'react';
import { Avatar } from '../components/Avatar';
import { EmptyState } from '../components/EmptyState';
import { Icon } from '../components/Icon';
import { useAsync } from '../components/useAsync';
import { formatTimestamp } from '../dates';
import { useFamily } from '../session';
import type { Post } from '../types';
import { useResource } from '../useResource';

export function PostCard({ post, onDelete }: { post: Post; onDelete?(): void }) {
  const { member } = useFamily();
  const author = member(post.created_by) ?? { name: 'Ehemaliges Mitglied', color: '#868e96' };
  return (
    <article className="post">
      <Avatar member={author} size={36} />
      <div className="post-body">
        <header>
          <strong>{author.name}</strong>
          <small className="muted">{formatTimestamp(post.created_at)}</small>
          <span className="spacer" />
          {onDelete && (
            <button className="icon-button subtle" onClick={onDelete} aria-label="Beitrag löschen">
              <Icon name="trash" size={16} />
            </button>
          )}
        </header>
        <p>{post.text}</p>
      </div>
    </article>
  );
}

export function BoardPage() {
  const { user, family } = useFamily();
  const posts = useResource<Post>('posts');
  const [text, setText] = useState('');
  const { busy, error, run } = useAsync();
  const isAdmin = family.members.find((m) => m.id === user.id)?.role === 'admin';

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    void run(async () => {
      await posts.create({ text });
      setText('');
    });
  };

  // Neueste zuerst; optimistisch angehängte Beiträge stehen kurz am Ende, daher sortieren
  const sorted = [...posts.items].sort((a, b) => b.id - a.id);

  return (
    <div className="page narrow">
      <header className="page-header">
        <h1>Pinnwand</h1>
      </header>
      <form className="card composer" onSubmit={submit}>
        <Avatar member={user} size={36} />
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit(e);
          }}
          placeholder="Was gibt's Neues?"
          rows={2}
          aria-label="Neuer Beitrag"
        />
        <button className="button primary" disabled={busy || !text.trim()} aria-label="Senden"><Icon name="send" /></button>
      </form>
      {error && <p className="error">{error}</p>}
      <div className="card">
        {!posts.loading && sorted.length === 0 ? (
          <EmptyState icon="chat" title="Noch keine Beiträge">Schreib der Familie die erste Nachricht.</EmptyState>
        ) : (
          sorted.map((p) => (
            <PostCard
              key={p.id}
              post={p}
              onDelete={p.created_by === user.id || isAdmin ? () => confirm('Beitrag löschen?') && void posts.remove(p.id) : undefined}
            />
          ))
        )}
      </div>
    </div>
  );
}

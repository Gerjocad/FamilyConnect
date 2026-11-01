import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { api } from '../api';
import { Avatar } from '../components/Avatar';
import { EmptyState } from '../components/EmptyState';
import { Icon } from '../components/Icon';
import { useAsync } from '../components/useAsync';
import { formatDay, formatTimestamp, parseLocal } from '../dates';
import { onLiveChange } from '../live';
import { usePermissions } from '../permissions';
import { useFamily } from '../session';
import type { Post } from '../types';
import { useResource } from '../useResource';
import { PostInteractions } from '../components/PostInteractions';
import { usePostExtras, type PostExtras } from '../postExtras';

export interface Poll {
  post_id: number;
  options: { id: number; text: string }[];
  votes: { option_id: number; user_id: number }[];
  /** Umfrage mit Ziel: Ergebnis kommt in den Essensplan bzw. in den Kalender */
  plan: PollPlan | null;
}

export type MealSlot = 'breakfast' | 'lunch' | 'dinner';
export interface PollPlan {
  kind: 'meal' | 'trip';
  date: string;
  slot: MealSlot | null;
  start_time: string | null;
  end_time: string | null;
  result_option_id: number | null;
  /** eingetragene Mahlzeit bzw. eingetragener Termin */
  result_ref: number | null;
  closed_at: string | null;
}
export type NewPollPlan = Pick<PollPlan, 'kind' | 'date'> & Partial<Pick<PollPlan, 'slot' | 'start_time' | 'end_time'>>;

export const SLOT_NAMES: Record<MealSlot, string> = { breakfast: 'Frühstück', lunch: 'Mittagessen', dinner: 'Abendessen' };

/** „🍽️ Abendessen · Samstag, 7. November“ bzw. „🚗 Ausflug · Sonntag, 8. November, 10:00–16:00“ */
export function planLabel(plan: Pick<PollPlan, 'kind' | 'date' | 'slot' | 'start_time' | 'end_time'>) {
  const day = formatDay(parseLocal(plan.date));
  if (plan.kind === 'meal') return `🍽️ ${SLOT_NAMES[plan.slot ?? 'dinner']} · ${day}`;
  const time = plan.start_time ? `, ${plan.start_time}${plan.end_time ? `–${plan.end_time}` : ''} Uhr` : '';
  return `🚗 Ausflug · ${day}${time}`;
}

/** Abstimmungen der Familie; lädt bei neuen Stimmen und Beiträgen neu */
export function usePolls() {
  const { family } = useFamily();
  const base = `/families/${family.id}/polls`;
  const [polls, setPolls] = useState<Poll[]>([]);
  const reload = useCallback(async () => {
    try {
      setPolls(await api<Poll[]>(base));
    } catch {
      // offline
    }
  }, [base]);
  useEffect(() => {
    void reload();
    return onLiveChange((resource) => (resource === 'polls' || resource === 'posts') && void reload());
  }, [reload]);
  const vote = async (poll: Poll, optionId: number | null) => {
    const updated = await api<Poll>(`${base}/${poll.post_id}/vote`, { method: 'PUT', body: { option_id: optionId } });
    setPolls((prev) => prev.map((p) => (p.post_id === poll.post_id ? updated : p)));
  };
  const create = async (text: string, options: string[], plan?: NewPollPlan) => {
    await api(base, { method: 'POST', body: { text, options, plan } });
    await reload();
  };
  /** Umfrage beenden und eintragen; optionId bei Gleichstand */
  const close = async (poll: Poll, optionId?: number) => {
    const updated = await api<Poll>(`${base}/${poll.post_id}/close`, { method: 'POST', body: { option_id: optionId } });
    setPolls((prev) => prev.map((p) => (p.post_id === poll.post_id ? updated : p)));
  };
  const forPost = (postId: number) => polls.find((p) => p.post_id === postId);
  return { polls, forPost, vote, create, close };
}

export function PollView({ poll, onVote, onClose }: {
  poll: Poll;
  onVote(optionId: number | null): void;
  /** Umfrage mit Ziel beenden (nur wer gefragt hat bzw. Eltern) */
  onClose?(optionId?: number): Promise<unknown>;
}) {
  const { user, member, family } = useFamily();
  const { busy, error, run } = useAsync();
  const [choosing, setChoosing] = useState(false);
  const mine = poll.votes.find((v) => v.user_id === user.id)?.option_id ?? null;
  const total = poll.votes.length;
  const countOf = (id: number) => poll.votes.filter((v) => v.option_id === id).length;
  const leader = Math.max(0, ...poll.options.map((o) => countOf(o.id)));
  const plan = poll.plan;
  const result = plan?.closed_at ? poll.options.find((o) => o.id === plan.result_option_id) : undefined;
  const tied = poll.options.filter((o) => leader > 0 && countOf(o.id) === leader);
  const missing = family.members.length - total;
  const finish = (optionId?: number) => void run(async () => {
    await onClose!(optionId);
    setChoosing(false);
  });
  return (
    <div className={`poll ${result ? 'decided' : ''}`} role="group" aria-label="Abstimmung">
      {plan && <span className="poll-plan">{planLabel(plan)}</span>}
      {result && (
        <Link className="poll-result" to={plan!.kind === 'meal' ? '/essen' : `/kalender?tag=${plan!.date}&termin=${plan!.result_ref}`}>
          ✅ <strong>{result.text}</strong> – {plan!.kind === 'meal' ? 'steht im Essensplan' : 'steht im Kalender'} ›
        </Link>
      )}
      {poll.options.map((o) => {
        const voters = poll.votes.filter((v) => v.option_id === o.id);
        const share = total ? Math.round((voters.length / total) * 100) : 0;
        return (
          <button
            key={o.id}
            className={`poll-option ${mine === o.id ? 'mine' : ''} ${voters.length > 0 && voters.length === leader ? 'leading' : ''}`}
            onClick={() => (choosing ? finish(o.id) : onVote(mine === o.id ? null : o.id))}
            disabled={Boolean(result) || busy}
            aria-pressed={mine === o.id}
          >
            <span className="poll-bar" style={{ width: `${share}%` }} />
            <span className="poll-text">{mine === o.id && <Icon name="check" size={14} />} {o.text}</span>
            <span className="poll-voters">
              {voters.slice(0, 4).map((v) => {
                const m = member(v.user_id);
                return m ? <Avatar key={v.user_id} member={m} size={18} /> : null;
              })}
            </span>
            <span className="poll-count">{voters.length}</span>
          </button>
        );
      })}
      {!result && !choosing && (
        <small className="muted">
          {total === 0 ? 'Noch keine Stimmen – tipp auf eine Antwort' : `${total} ${total === 1 ? 'Stimme' : 'Stimmen'} · nochmal tippen nimmt deine Stimme zurück`}
          {plan && missing > 0 && ` · wenn alle ${family.members.length} abgestimmt haben, wird es eingetragen`}
        </small>
      )}
      {choosing && <small className="poll-choose">Gleichstand – tipp auf die Antwort, die eingetragen werden soll</small>}
      {plan && !result && onClose && (
        <div className="form-actions">
          {choosing
            ? <button type="button" className="link-button" onClick={() => setChoosing(false)}>Abbrechen</button>
            : (
              <button type="button" className="button small" disabled={busy || total === 0}
                onClick={() => (tied.length > 1 ? setChoosing(true) : finish())}>
                🗳️ Beenden & eintragen
              </button>
            )}
        </div>
      )}
      {error && <p className="error">{error}</p>}
    </div>
  );
}

export function PostCard({ post, poll, onVote, onClosePoll, onDelete, extras, compact }: {
  post: Post;
  poll?: Poll;
  onVote?(optionId: number | null): void;
  onClosePoll?(optionId?: number): Promise<unknown>;
  onDelete?(): void;
  extras?: PostExtras;
  /** Übersicht: Kommentare erst auf Antippen */
  compact?: boolean;
}) {
  const { member, user } = useFamily();
  const { isManager } = usePermissions();
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
        <p>{poll && (poll.plan ? '🗳️ ' : '📊 ')}{post.text}</p>
        {poll && onVote && (
          <PollView poll={poll} onVote={onVote}
            onClose={onClosePoll && (post.created_by === user.id || isManager) ? onClosePoll : undefined} />
        )}
        {extras && <PostInteractions postId={post.id} extras={extras} compact={compact} />}
      </div>
    </article>
  );
}

export function BoardPage() {
  const { user } = useFamily();
  const posts = useResource<Post>('posts');
  const polls = usePolls();
  const extras = usePostExtras();
  const [text, setText] = useState('');
  // Abstimmung: Antwortfelder (leere werden ignoriert)
  const [options, setOptions] = useState<string[] | null>(null);
  const filledOptions = options?.map((o) => o.trim()).filter(Boolean) ?? [];
  const { busy, error, run } = useAsync();
  const { isManager } = usePermissions();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    void run(async () => {
      if (options) {
        await polls.create(text, filledOptions);
        setOptions(null);
        await posts.reload();
      } else {
        await posts.create({ text });
      }
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
          placeholder={options ? 'Deine Frage, z. B. Was essen wir am Samstag?' : "Was gibt's Neues?"}
          rows={2}
          aria-label={options ? 'Frage der Abstimmung' : 'Neuer Beitrag'}
        />
        <button className="button primary" disabled={busy || !text.trim() || (options !== null && filledOptions.length < 2)} aria-label="Senden"><Icon name="send" /></button>
        {options ? (
          <div className="poll-editor">
            {options.map((o, i) => (
              <input
                key={i}
                value={o}
                onChange={(e) => setOptions(options.map((x, j) => (j === i ? e.target.value : x)))}
                placeholder={`Antwort ${i + 1}`}
                aria-label={`Antwort ${i + 1}`}
                maxLength={100}
              />
            ))}
            <div className="form-actions">
              {options.length < 6 && <button type="button" className="link-button" onClick={() => setOptions([...options, ''])}><Icon name="plus" size={14} /> Antwort</button>}
              <span className="spacer" />
              <button type="button" className="link-button" onClick={() => setOptions(null)}>Keine Abstimmung</button>
            </div>
          </div>
        ) : (
          <button type="button" className="link-button poll-toggle" onClick={() => setOptions(['', ''])}>📊 Abstimmung</button>
        )}
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
              poll={polls.forPost(p.id)}
              extras={extras}
              onVote={(optionId) => {
                const poll = polls.forPost(p.id);
                if (poll) void run(() => polls.vote(poll, optionId));
              }}
              onClosePoll={(optionId) => polls.close(polls.forPost(p.id)!, optionId)}
              onDelete={p.created_by === user.id || isManager ? () => confirm('Beitrag löschen?') && void posts.remove(p.id) : undefined}
            />
          ))
        )}
      </div>
    </div>
  );
}

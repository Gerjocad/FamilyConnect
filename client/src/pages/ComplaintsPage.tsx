import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { api, getServerUrl, getToken } from '../api';
import { Avatar } from '../components/Avatar';
import { EmptyState } from '../components/EmptyState';
import { Icon } from '../components/Icon';
import { MemberPicker } from '../components/MemberPicker';
import { Modal } from '../components/Modal';
import { useAsync } from '../components/useAsync';
import { formatTimestamp } from '../dates';
import { compressImage } from '../images';
import { onLiveChange } from '../live';
import { usePermissions } from '../permissions';
import { useFamily } from '../session';

export interface Complaint {
  id: number;
  created_by: number | null;
  recipient_id: number | null;
  text: string;
  images: string[];
  status: 'open' | 'resolved';
  reply: string;
  resolved_by: number | null;
  resolved_at: string | null;
  created_at: string;
  comments: ComplaintComment[];
}

export interface ComplaintComment { id: number; user_id: number | null; text: string; created_at: string }

const MAX_IMAGES = 3;
const FORMER = { name: 'Ehemaliges Mitglied', color: '#868e96' };

type Tab = 'inbox' | 'sent' | 'all';

const imageUrl = (base: string, name: string) =>
  `${getServerUrl()}/api${base.replace(/complaints$/, 'complaint-images')}/${name}?token=${encodeURIComponent(getToken() ?? '')}`;

/** Beschwerden laden und bei Änderungen (auch von anderen) neu laden */
export function useComplaints() {
  const { family } = useFamily();
  const base = `/families/${family.id}/complaints`;
  const [items, setItems] = useState<Complaint[]>([]);
  const [loading, setLoading] = useState(true);
  const reload = useCallback(async () => {
    try {
      setItems(await api<Complaint[]>(base));
    } catch {
      // offline – alter Stand bleibt stehen
    } finally {
      setLoading(false);
    }
  }, [base]);
  useEffect(() => {
    void reload();
    return onLiveChange((resource) => resource === 'complaints' && void reload());
  }, [reload]);
  return { base, items, loading, reload };
}

/** Kommentare unter einer Beschwerde – für alle, die sie sehen dürfen */
function ComplaintComments({ complaint, base, onChanged }: { complaint: Complaint; base: string; onChanged(): void }) {
  const { user, member, family } = useFamily();
  const { isManager } = usePermissions();
  const [opened, setOpen] = useState(false);
  const [text, setText] = useState('');
  const { busy, error, run } = useAsync();
  const count = complaint.comments.length;
  // mit Kommentaren immer offen, sonst erst auf Antippen
  const open = opened || count > 0;

  const send = (e: FormEvent) => {
    e.preventDefault();
    const value = text.trim();
    if (!value) return;
    void run(async () => {
      await api(`${base}/${complaint.id}/comments`, { method: 'POST', body: { text: value } });
      setText('');
      onChanged();
    });
  };

  if (!open) {
    return (
      <button type="button" className="link-button complaint-comment-toggle" onClick={() => setOpen(true)}>
        <Icon name="chat" size={16} /> Kommentieren
      </button>
    );
  }
  return (
    <section className="event-comments complaint-comments">
      <h3><Icon name="chat" size={16} /> Kommentare{count > 0 && ` (${count})`}</h3>
      {count > 0 && (
        <ul className="comment-list">
          {complaint.comments.map((c) => {
            const author = c.user_id ? member(c.user_id) : undefined;
            return (
              <li key={c.id} className="comment">
                {author ? <Avatar member={author} size={26} /> : <span className="avatar neutral" style={{ width: 26, height: 26 }}>?</span>}
                <div className="comment-body">
                  <small className="muted"><strong>{c.user_id === user.id ? 'Du' : author?.name.split(' ')[0] ?? FORMER.name}</strong> · {formatTimestamp(c.created_at)}</small>
                  <p>{c.text}</p>
                </div>
                {(c.user_id === user.id || isManager) && (
                  <button type="button" className="icon-button subtle" aria-label="Kommentar löschen" disabled={busy}
                    onClick={() => confirm('Kommentar löschen?') && void run(async () => {
                      await api(`/families/${family.id}/complaint-comments/${c.id}`, { method: 'DELETE' });
                      onChanged();
                    })}>
                    <Icon name="trash" size={14} />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <form className="quick-add" onSubmit={send}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Kommentar schreiben …" aria-label="Kommentar" maxLength={1000} autoFocus={count === 0} />
        <button className="button" disabled={busy || !text.trim()} aria-label="Kommentar senden"><Icon name="send" /></button>
      </form>
      {error && <p className="error">{error}</p>}
    </section>
  );
}

function ComplaintCard({ complaint, base, onViewImage, onChanged }: {
  complaint: Complaint;
  base: string;
  onViewImage(name: string): void;
  onChanged(): void;
}) {
  const { user, member } = useFamily();
  const { isManager } = usePermissions();
  const [reply, setReply] = useState('');
  const [answering, setAnswering] = useState(false);
  const { busy, error, run } = useAsync();
  const from = member(complaint.created_by) ?? FORMER;
  const to = member(complaint.recipient_id) ?? FORMER;
  const resolver = member(complaint.resolved_by);
  const isRecipient = complaint.recipient_id === user.id;
  const canAnswer = isRecipient || isManager;
  const canDelete = complaint.created_by === user.id || isManager;
  const resolved = complaint.status === 'resolved';

  const update = (body: { status: Complaint['status']; reply?: string }) =>
    void run(async () => {
      await api(`${base}/${complaint.id}`, { method: 'PATCH', body });
      setAnswering(false);
      setReply('');
      onChanged();
    });

  return (
    <article className={`card complaint ${resolved ? 'is-resolved' : ''}`}>
      <header className="complaint-head">
        <Avatar member={from} size={32} />
        <Icon name="right" size={16} />
        <Avatar member={to} size={32} />
        <span className="complaint-who">
          <strong>{complaint.created_by === user.id ? 'Du' : from.name.split(' ')[0]} → {isRecipient ? 'dich' : to.name.split(' ')[0]}</strong>
          <small className="muted">{formatTimestamp(complaint.created_at)}</small>
        </span>
        <span className="spacer" />
        <span className={`badge ${resolved ? 'resolved' : 'open'}`}>{resolved ? 'Erledigt' : 'Offen'}</span>
      </header>

      <p className="complaint-text">{complaint.text}</p>
      <div className="complaint-photos">
        {complaint.images.map((name) => (
          <button key={name} className="complaint-photo" onClick={() => onViewImage(name)} aria-label="Foto vergrößern">
            <img src={imageUrl(base, name)} alt="Foto zur Beschwerde" loading="lazy" />
          </button>
        ))}
      </div>

      {resolved && (
        <div className="complaint-reply">
          <Icon name="check" size={16} />
          <span>
            <strong>{resolver ? resolver.name.split(' ')[0] : 'Erledigt'}</strong>
            {complaint.reply ? `: ${complaint.reply}` : ' hat es erledigt.'}
          </span>
        </div>
      )}

      <ComplaintComments complaint={complaint} base={base} onChanged={onChanged} />

      {answering && (
        <div className="form complaint-answer">
          <label>
            Antwort (optional)
            <textarea value={reply} onChange={(e) => setReply(e.target.value)} rows={2} maxLength={1000} placeholder="z. B. Ist erledigt, sorry!" autoFocus />
          </label>
        </div>
      )}
      {error && <p className="error">{error}</p>}

      {(canAnswer || canDelete) && (
        <div className="form-actions complaint-actions">
          {canDelete && (
            <button
              className="icon-button subtle"
              aria-label="Beschwerde löschen"
              disabled={busy}
              onClick={() => confirm('Beschwerde löschen?') && void run(async () => {
                await api(`${base}/${complaint.id}`, { method: 'DELETE' });
                onChanged();
              })}
            >
              <Icon name="trash" size={16} />
            </button>
          )}
          <span className="spacer" />
          {canAnswer && !resolved && !answering && (
            <button className="button small primary" onClick={() => setAnswering(true)}>
              <Icon name="check" size={16} /> Erledigen
            </button>
          )}
          {answering && (
            <>
              <button className="button small" onClick={() => setAnswering(false)} disabled={busy}>Abbrechen</button>
              <button className="button small primary" onClick={() => update({ status: 'resolved', reply })} disabled={busy}>
                <Icon name="check" size={16} /> Erledigt
              </button>
            </>
          )}
          {canAnswer && resolved && (
            <button className="button small" onClick={() => update({ status: 'open' })} disabled={busy}>Wieder öffnen</button>
          )}
        </div>
      )}
    </article>
  );
}

export function ComplaintsPage() {
  const { user, family } = useFamily();
  const { isManager } = usePermissions();
  const { base, items, loading, reload } = useComplaints();
  const [recipient, setRecipient] = useState<number[]>([]);
  const [text, setText] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [tab, setTab] = useState<Tab>('inbox');
  const [viewing, setViewing] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const { busy, error, run, setError } = useAsync();

  const others = family.members.filter((m) => m.id !== user.id);
  const inbox = items.filter((c) => c.recipient_id === user.id);
  const outbox = items.filter((c) => c.created_by === user.id);
  const shown = tab === 'inbox' ? inbox : tab === 'sent' ? outbox : items;
  const openInbox = inbox.filter((c) => c.status === 'open').length;

  const addFiles = (files: FileList | null) => {
    if (!files?.length) return;
    void run(async () => {
      const room = MAX_IMAGES - images.length;
      if (files.length > room) setError(`Höchstens ${MAX_IMAGES} Fotos`);
      const added = await Promise.all([...files].slice(0, room).map(compressImage));
      setImages((prev) => [...prev, ...added]);
    });
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!recipient[0]) return setError('Bitte wähle aus, an wen die Beschwerde geht');
    if (images.length === 0) return setError('Bitte füge ein Foto hinzu');
    void run(async () => {
      await api(base, { method: 'POST', body: { recipient_id: recipient[0], text, images } });
      setText('');
      setImages([]);
      setRecipient([]);
      setTab('sent');
      setSent(true);
      window.setTimeout(() => setSent(false), 3000);
      await reload();
    });
  };

  return (
    <div className="page narrow">
      <header className="page-header">
        <h1>Beschwerden</h1>
      </header>

      {others.length === 0 ? (
        <div className="card">
          <EmptyState icon="complaint" title="Noch niemand da">Sobald weitere Familienmitglieder dabei sind, kannst du hier Beschwerden schicken.</EmptyState>
        </div>
      ) : (
        <form className="card form" onSubmit={submit}>
          <h2>Neue Beschwerde</h2>
          <div className="field">
            <span>An wen?</span>
            <MemberPicker value={recipient} onChange={setRecipient} single exclude={[user.id]} />
          </div>
          <div className="field">
            <span>Foto (1–{MAX_IMAGES})</span>
            <div className="thumbs">
              {images.map((src, i) => (
                <div key={i} className="thumb">
                  <img src={src} alt={`Foto ${i + 1}`} />
                  <button type="button" className="thumb-remove" aria-label="Foto entfernen" onClick={() => setImages(images.filter((_, j) => j !== i))}>
                    <Icon name="close" size={14} />
                  </button>
                </div>
              ))}
              {images.length < MAX_IMAGES && (
                <>
                  <button type="button" className="thumb add" onClick={() => cameraInput.current?.click()}>
                    <Icon name="camera" size={22} />
                    <small>Foto machen</small>
                  </button>
                  <button type="button" className="thumb add" onClick={() => fileInput.current?.click()}>
                    <Icon name="image" size={22} />
                    <small>Auswählen</small>
                  </button>
                </>
              )}
            </div>
            {/* capture öffnet direkt die Kamera (Handy); am Computer kommt die normale Dateiauswahl */}
            <input
              ref={cameraInput}
              type="file"
              accept="image/*"
              capture="environment"
              hidden
              onChange={(e) => {
                addFiles(e.target.files);
                e.target.value = '';
              }}
            />
            <input
              ref={fileInput}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(e) => {
                addFiles(e.target.files);
                e.target.value = '';
              }}
            />
          </div>
          <label>
            Was ist los?
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} maxLength={1000} placeholder="z. B. Das Geschirr steht seit gestern in der Spüle …" required />
          </label>
          {error && <p className="error">{error}</p>}
          {sent && <p className="success">Beschwerde wurde geschickt.</p>}
          <button className="button primary" disabled={busy || !text.trim()}>
            <Icon name="send" size={18} /> Beschwerde senden
          </button>
        </form>
      )}

      <div className="segmented" role="tablist">
        <button role="tab" aria-selected={tab === 'inbox'} className={tab === 'inbox' ? 'active' : ''} onClick={() => setTab('inbox')}>
          An mich {openInbox > 0 && <span className="badge">{openInbox}</span>}
        </button>
        <button role="tab" aria-selected={tab === 'sent'} className={tab === 'sent' ? 'active' : ''} onClick={() => setTab('sent')}>Von mir</button>
        {isManager && (
          <button role="tab" aria-selected={tab === 'all'} className={tab === 'all' ? 'active' : ''} onClick={() => setTab('all')}>Alle</button>
        )}
      </div>

      {!loading && shown.length === 0 ? (
        <div className="card">
          <EmptyState icon="complaint" title={tab === 'inbox' ? 'Keine Beschwerden an dich 🎉' : 'Keine Beschwerden'} />
        </div>
      ) : (
        shown.map((c) => (
          <ComplaintCard key={c.id} complaint={c} base={base} onViewImage={setViewing} onChanged={() => void reload()} />
        ))
      )}

      {viewing && (
        <Modal title="Foto" onClose={() => setViewing(null)}>
          <img className="screenshot-full" src={imageUrl(base, viewing)} alt="Foto zur Beschwerde" />
        </Modal>
      )}
    </div>
  );
}

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { api, getServerUrl, getToken } from '../api';
import { Avatar } from '../components/Avatar';
import { EmptyState } from '../components/EmptyState';
import { Icon } from '../components/Icon';
import { Modal } from '../components/Modal';
import { useAsync } from '../components/useAsync';
import { formatTimestamp } from '../dates';
import { compressImage } from '../images';
import { onLiveChange } from '../live';
import { usePermissions } from '../permissions';
import { useFamily } from '../session';

interface Feedback {
  id: number;
  created_by: number | null;
  kind: 'bug' | 'idea';
  text: string;
  status: 'open' | 'done';
  images: string[];
  created_at: string;
}

const KIND_LABEL = { bug: '🐞 Fehler', idea: '💡 Wunsch' } as const;
const MAX_IMAGES = 5;
export function FeedbackPage() {
  const { family, user, member } = useFamily();
  const base = `/families/${family.id}/feedback`;
  const [items, setItems] = useState<Feedback[]>([]);
  const [loading, setLoading] = useState(true);
  const [kind, setKind] = useState<Feedback['kind']>('bug');
  const [text, setText] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [viewing, setViewing] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const { busy, error, run, setError } = useAsync();
  const { isManager } = usePermissions();

  const reload = useCallback(async () => {
    try {
      setItems(await api<Feedback[]>(base));
    } finally {
      setLoading(false);
    }
  }, [base]);

  useEffect(() => {
    void reload();
    return onLiveChange((resource) => resource === 'feedback' && void reload());
  }, [reload]);

  const imageUrl = (name: string) =>
    `${getServerUrl()}/api/families/${family.id}/feedback-images/${name}?token=${encodeURIComponent(getToken() ?? '')}`;

  const addFiles = (files: FileList | null) => {
    if (!files?.length) return;
    void run(async () => {
      const room = MAX_IMAGES - images.length;
      if (files.length > room) setError(`Höchstens ${MAX_IMAGES} Bilder pro Eintrag`);
      const added = await Promise.all([...files].slice(0, room).map(compressImage));
      setImages((prev) => [...prev, ...added]);
    });
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      await api(base, { method: 'POST', body: { kind, text, images } });
      setText('');
      setImages([]);
      await reload();
    });
  };

  // Offene Einträge als Text, z. B. um sie weiterzugeben
  const copyOpen = async () => {
    const open = items.filter((f) => f.status === 'open');
    const lines = open.map((f, i) => {
      const who = member(f.created_by)?.name ?? 'Unbekannt';
      const pics = f.images.length ? ` [${f.images.length} Screenshot${f.images.length > 1 ? 's' : ''}]` : '';
      return `${i + 1}. ${KIND_LABEL[f.kind]} (${who}): ${f.text}${pics}`;
    });
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Zwischenablage nicht verfügbar
    }
  };

  const openCount = items.filter((f) => f.status === 'open').length;

  return (
    <div className="page narrow">
      <header className="page-header">
        <h1>Feedback</h1>
      </header>

      <form className="card form" onSubmit={submit}>
        <div className="segmented" role="tablist">
          {(['bug', 'idea'] as const).map((k) => (
            <button key={k} type="button" role="tab" aria-selected={kind === k} className={kind === k ? 'active' : ''} onClick={() => setKind(k)}>
              {KIND_LABEL[k]}
            </button>
          ))}
        </div>
        <label>
          {kind === 'bug' ? 'Was funktioniert nicht?' : 'Was wünschst du dir?'}
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            placeholder={kind === 'bug' ? 'z. B. Beim Speichern eines Termins passiert nichts …' : 'z. B. Geburtstage im Kalender anzeigen …'}
            required
          />
        </label>
        <div className="field">
          <span>Screenshots (optional, bis zu {MAX_IMAGES})</span>
          <div className="thumbs">
            {images.map((src, i) => (
              <div key={i} className="thumb">
                <img src={src} alt={`Screenshot ${i + 1}`} />
                <button type="button" className="thumb-remove" aria-label="Bild entfernen" onClick={() => setImages(images.filter((_, j) => j !== i))}>
                  <Icon name="close" size={14} />
                </button>
              </div>
            ))}
            {images.length < MAX_IMAGES && (
              <button type="button" className="thumb add" onClick={() => fileInput.current?.click()} aria-label="Screenshot hinzufügen">
                <Icon name="image" size={22} />
                <small>Hinzufügen</small>
              </button>
            )}
          </div>
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
        {error && <p className="error">{error}</p>}
        <button className="button primary" disabled={busy || !text.trim()}>
          <Icon name="send" size={18} /> Absenden
        </button>
      </form>

      <section className="card">
        <header className="section-header">
          <h2>Einträge {openCount > 0 && <span className="badge">{openCount} offen</span>}</h2>
          <span className="spacer" />
          {openCount > 0 && (
            <button className="button small" onClick={() => void copyOpen()}>
              <Icon name="copy" size={16} /> {copied ? 'Kopiert!' : 'Offene kopieren'}
            </button>
          )}
        </header>
        {!loading && items.length === 0 ? (
          <EmptyState icon="feedback" title="Noch nichts gemeldet">Fehler und Wünsche landen hier – mit Screenshots.</EmptyState>
        ) : (
          items.map((f) => {
            const author = member(f.created_by) ?? { name: 'Ehemaliges Mitglied', color: '#868e96' };
            const canEdit = f.created_by === user.id || isManager;
            return (
              <article key={f.id} className={`post feedback ${f.status === 'done' ? 'is-done' : ''}`}>
                <Avatar member={author} size={36} />
                <div className="post-body">
                  <header>
                    <strong>{author.name.split(' ')[0]}</strong>
                    <span className={`badge ${f.kind}`}>{KIND_LABEL[f.kind]}</span>
                    <small className="muted">{formatTimestamp(f.created_at)}</small>
                  </header>
                  <p>{f.text}</p>
                  {f.images.length > 0 && (
                    <div className="thumbs">
                      {f.images.map((name) => (
                        <button key={name} className="thumb" onClick={() => setViewing(name)} aria-label="Screenshot vergrößern">
                          <img src={imageUrl(name)} alt="Screenshot" loading="lazy" />
                        </button>
                      ))}
                    </div>
                  )}
                  {canEdit && (
                    <div className="form-actions feedback-actions">
                      <button
                        className={`button small ${f.status === 'done' ? '' : 'primary'}`}
                        onClick={() => void api(`${base}/${f.id}`, { method: 'PATCH', body: { status: f.status === 'done' ? 'open' : 'done' } }).then(reload)}
                      >
                        <Icon name="check" size={16} /> {f.status === 'done' ? 'Wieder öffnen' : 'Erledigt'}
                      </button>
                      <button
                        className="icon-button subtle"
                        aria-label="Löschen"
                        onClick={() => confirm('Eintrag löschen?') && void api(`${base}/${f.id}`, { method: 'DELETE' }).then(reload)}
                      >
                        <Icon name="trash" size={16} />
                      </button>
                    </div>
                  )}
                </div>
              </article>
            );
          })
        )}
      </section>

      {viewing && (
        <Modal title="Screenshot" onClose={() => setViewing(null)}>
          <img className="screenshot-full" src={imageUrl(viewing)} alt="Screenshot" />
        </Modal>
      )}
    </div>
  );
}

import { useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router';
import { Avatar } from '../components/Avatar';
import { EmptyState } from '../components/EmptyState';
import { Icon } from '../components/Icon';
import { MemberPicker } from '../components/MemberPicker';
import { Modal } from '../components/Modal';
import { useAsync } from '../components/useAsync';
import { usePermissions } from '../permissions';
import { useFamily } from '../session';
import { useWishes, type Wish, type WishFields } from '../wishes';

function WishForm({ wish, ownerId, onSave, onDelete, onClose }: {
  wish?: Wish;
  ownerId: number;
  onSave(owner: number, data: WishFields): Promise<unknown>;
  onDelete?(): Promise<unknown>;
  onClose(): void;
}) {
  const { user, member } = useFamily();
  const { isManager } = usePermissions();
  const [owner, setOwner] = useState(wish?.owner_id ?? ownerId);
  const [title, setTitle] = useState(wish?.title ?? '');
  const [link, setLink] = useState(wish?.link ?? '');
  const [price, setPrice] = useState(wish?.price ?? '');
  const [notes, setNotes] = useState(wish?.notes ?? '');
  const { busy, error, run } = useAsync();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      await onSave(owner, { title, link: link.trim(), price, notes });
      onClose();
    });
  };

  const forOther = owner !== user.id;
  return (
    <Modal title={wish ? 'Wunsch bearbeiten' : 'Neuer Wunsch'} onClose={onClose}>
      <form onSubmit={submit} className="form">
        {isManager && !wish && (
          <div className="field">
            <span>Wessen Wunsch? <small className="hint">(z. B. für Kinder ohne Handy)</small></span>
            <MemberPicker single value={[owner]} onChange={(ids) => ids[0] && setOwner(ids[0])} />
          </div>
        )}
        <label>
          {forOther ? `Was wünscht sich ${member(owner)?.name.split(' ')[0] ?? 'die Person'}?` : 'Was wünschst du dir?'}
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="z. B. Lego Eiskönigin-Schloss" maxLength={200} required autoFocus />
        </label>
        <label>
          Link <span className="hint">(optional, z. B. zum Shop)</span>
          <input type="url" inputMode="url" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://…" maxLength={1000} />
        </label>
        <label>
          Preis ungefähr <span className="hint">(optional)</span>
          <input value={price} onChange={(e) => setPrice(e.target.value)} placeholder="z. B. 40 €" maxLength={30} />
        </label>
        <label>
          Notizen <span className="hint">(Größe, Farbe …)</span>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} maxLength={1000} />
        </label>
        {error && <p className="error">{error}</p>}
        <div className="form-actions">
          {onDelete && (
            <button type="button" className="button danger" disabled={busy} onClick={() => confirm('Wunsch löschen?') && void run(async () => { await onDelete(); onClose(); })}>
              Löschen
            </button>
          )}
          <span className="spacer" />
          <button type="button" className="button" onClick={onClose}>Abbrechen</button>
          <button className="button primary" disabled={busy}>Speichern</button>
        </div>
      </form>
    </Modal>
  );
}

const linkHost = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return 'Link';
  }
};

export function WishesPage() {
  const { user, family, member } = useFamily();
  const { isManager } = usePermissions();
  const wishes = useWishes();
  const [params, setParams] = useSearchParams();
  const [editing, setEditing] = useState<Wish | 'new' | null>(null);
  const { error, run } = useAsync();

  const requested = Number(params.get('person'));
  const personId = family.members.some((m) => m.id === requested) ? requested : user.id;
  const person = member(personId);
  const own = personId === user.id;
  const list = wishes.items.filter((w) => w.owner_id === personId);
  const count = (id: number) => wishes.items.filter((w) => w.owner_id === id).length;
  const canEdit = (w: Wish) => w.owner_id === user.id || w.created_by === user.id || isManager;
  // eigene zuerst, dann die anderen in der gewohnten Reihenfolge
  const members = [...family.members].sort((a, b) => Number(b.id === user.id) - Number(a.id === user.id));

  return (
    <div className="page">
      <header className="page-header">
        <h1>Wünsche</h1>
        {(own || isManager) && (
          <button className="button primary" onClick={() => setEditing('new')}><Icon name="plus" /> Wunsch</button>
        )}
      </header>

      <div className="member-picker wish-people" role="tablist">
        {members.map((m) => (
          <button
            key={m.id}
            role="tab"
            aria-selected={m.id === personId}
            className={`chip ${m.id === personId ? 'chip-active' : ''}`}
            style={m.id === personId ? { borderColor: m.color, background: `${m.color}22` } : undefined}
            onClick={() => setParams(m.id === user.id ? {} : { person: String(m.id) }, { replace: true })}
          >
            <Avatar member={m} size={20} />
            {m.id === user.id ? 'Meine' : m.name.split(' ')[0]}
            {count(m.id) > 0 && <small className="muted">{count(m.id)}</small>}
          </button>
        ))}
      </div>

      <p className="hint wish-hint">
        {own
          ? '🤫 Was andere für dich besorgen, siehst du nicht – die Überraschung bleibt.'
          : `Tippe „Ich besorge das“, damit niemand doppelt kauft. ${person?.name.split(' ')[0] ?? ''} sieht das nicht.`}
      </p>
      {error && <p className="error">{error}</p>}

      {wishes.loaded && list.length === 0 ? (
        <EmptyState icon="gift" title={own ? 'Noch keine Wünsche' : `${person?.name.split(' ')[0]} hat noch keine Wünsche`}>
          <p className="muted">{own ? 'Trag ein, was du dir wünschst – mit Link zum Shop, wenn du magst.' : 'Sobald etwas eingetragen ist, steht es hier.'}</p>
        </EmptyState>
      ) : (
        <ul className="wish-list">
          {list.map((w) => {
            const mine = w.reserved_by === user.id;
            const taken = w.reserved_by !== null && !mine;
            return (
              <li key={w.id} className={`card wish ${w.reserved_by ? 'reserved' : ''}`}>
                <div className="wish-main">
                  <strong className="wish-title">{w.title}</strong>
                  <span className="wish-meta">
                    {w.price && <span className="badge">{w.price}</span>}
                    {w.link && (
                      <a href={w.link} target="_blank" rel="noopener noreferrer" className="wish-link">
                        <Icon name="external" size={14} /> {linkHost(w.link)}
                      </a>
                    )}
                  </span>
                  {w.notes && <small className="muted wish-notes">{w.notes}</small>}
                </div>
                <div className="wish-actions">
                  {!own && (
                    mine ? (
                      <>
                        <span className="wish-status mine"><Icon name="check" size={16} /> Du besorgst das</span>
                        <button className="link-button" onClick={() => void run(() => wishes.release(w))}>Zurückgeben</button>
                      </>
                    ) : taken ? (
                      <span className="wish-status">🎁 {member(w.reserved_by!)?.name.split(' ')[0] ?? 'Jemand'} besorgt das</span>
                    ) : (
                      <button className="button small primary" onClick={() => void run(() => wishes.reserve(w))}>🎁 Ich besorge das</button>
                    )
                  )}
                  {taken && isManager && (
                    <button className="link-button" onClick={() => confirm('Reservierung aufheben?') && void run(() => wishes.release(w))}>Freigeben</button>
                  )}
                  {canEdit(w) && (
                    <button className="icon-button subtle" aria-label={`${w.title} bearbeiten`} onClick={() => setEditing(w)}>
                      <Icon name="edit" size={18} />
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {editing && (
        <WishForm
          wish={editing === 'new' ? undefined : editing}
          ownerId={personId}
          onSave={(owner, data) => (editing === 'new' ? wishes.add({ ...data, owner_id: owner }) : wishes.update(editing, data))}
          onDelete={editing === 'new' ? undefined : () => wishes.remove(editing)}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

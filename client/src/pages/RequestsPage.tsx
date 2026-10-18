import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { api } from '../api';
import { Avatar } from '../components/Avatar';
import { EmptyState } from '../components/EmptyState';
import { Icon } from '../components/Icon';
import { MemberPicker } from '../components/MemberPicker';
import { Modal } from '../components/Modal';
import { useAsync } from '../components/useAsync';
import { formatShortDay, formatTimestamp, parseLocal } from '../dates';
import { onLiveChange } from '../live';
import { usePermissions } from '../permissions';
import { useFamily } from '../session';

export type RequestStatus = 'pending' | 'approved' | 'declined' | 'countered' | 'withdrawn';

export interface FamilyRequest {
  id: number;
  created_by: number | null;
  recipient_id: number | null;
  category: Category;
  title: string;
  details: string;
  date: string | null;
  time_from: string | null;
  time_to: string | null;
  status: RequestStatus;
  response_note: string;
  counter_date: string | null;
  counter_time_from: string | null;
  counter_time_to: string | null;
  counter_accepted: boolean;
  event_id: number | null;
  responded_at: string | null;
  created_at: string;
  updated_at: string;
}

// Gleiche Schlüssel wie CATEGORIES in server/src/requests.js
const CATEGORIES = {
  friends: { emoji: '👫', label: 'Freunde treffen', placeholder: 'Darf ich mich mit Tim treffen?' },
  free: { emoji: '🏖️', label: 'Frei haben', placeholder: 'Können wir am Samstag frei haben?' },
  sleepover: { emoji: '🛏️', label: 'Übernachten', placeholder: 'Darf ich bei Mia übernachten?' },
  media: { emoji: '🎮', label: 'Medienzeit', placeholder: 'Darf ich noch eine Stunde zocken?' },
  money: { emoji: '💶', label: 'Taschengeld', placeholder: 'Bekomme ich 10 € fürs Kino?' },
  ride: { emoji: '🚗', label: 'Fahrdienst', placeholder: 'Kannst du mich zum Training fahren?' },
  general: { emoji: '🙋', label: 'Sonstiges', placeholder: 'Darf ich …?' },
} as const;
type Category = keyof typeof CATEGORIES;

const STATUS: Record<RequestStatus, { label: string; className: string }> = {
  pending: { label: 'Wartet auf Antwort', className: 'pending' },
  approved: { label: 'Ja ✅', className: 'approved' },
  declined: { label: 'Nein', className: 'declined' },
  countered: { label: 'Gegenvorschlag', className: 'countered' },
  withdrawn: { label: 'Zurückgezogen', className: 'withdrawn' },
};

const FORMER = { name: 'Ehemaliges Mitglied', color: '#868e96' };
const first = (name: string) => name.split(' ')[0];

/** „Sa., 24. Okt. · 15:00–18:00“ */
function whenLabel(date: string | null, from: string | null, to: string | null) {
  if (!date) return null;
  const day = formatShortDay(parseLocal(date));
  if (!from) return day;
  return `${day} · ${from}${to ? `–${to}` : ' Uhr'}`;
}

/** Anfragen laden und bei Änderungen (auch von anderen) neu laden */
export function useRequests() {
  const { family, user } = useFamily();
  const base = `/families/${family.id}/requests`;
  const [items, setItems] = useState<FamilyRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const reload = useCallback(async () => {
    try {
      setItems(await api<FamilyRequest[]>(base));
    } catch {
      // offline – alter Stand bleibt stehen
    } finally {
      setLoading(false);
    }
  }, [base]);
  useEffect(() => {
    void reload();
    return onLiveChange((resource) => resource === 'requests' && void reload());
  }, [reload]);
  // Wo die angemeldete Person gerade gefragt ist: offene Anfragen an sie und Gegenvorschläge an sie
  const needsMe = items.filter((r) =>
    (r.status === 'pending' && r.recipient_id === user.id) || (r.status === 'countered' && r.created_by === user.id));
  return { base, items, loading, reload, needsMe };
}

function NewRequestForm({ base, onDone, onClose }: { base: string; onDone(): void; onClose(): void }) {
  const { user } = useFamily();
  const [category, setCategory] = useState<Category>('friends');
  const [recipient, setRecipient] = useState<number[]>([]);
  const [title, setTitle] = useState('');
  const [details, setDetails] = useState('');
  const [date, setDate] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const { busy, error, run, setError } = useAsync();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!recipient[0]) return setError('Bitte wähle aus, wen du fragst');
    void run(async () => {
      await api(base, {
        method: 'POST',
        body: { category, recipient_id: recipient[0], title, details, date: date || null, time_from: date && from ? from : null, time_to: date && to ? to : null },
      });
      onDone();
      onClose();
    });
  };

  return (
    <Modal title="Neue Anfrage" onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <div className="field">
          <span>Worum geht es?</span>
          <div className="category-picker">
            {(Object.keys(CATEGORIES) as Category[]).map((c) => (
              <button type="button" key={c} className={`category-option ${category === c ? 'active' : ''}`} onClick={() => setCategory(c)} aria-pressed={category === c}>
                <span className="category-emoji">{CATEGORIES[c].emoji}</span>
                {CATEGORIES[c].label}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <span>Wen fragst du?</span>
          <MemberPicker value={recipient} onChange={setRecipient} single exclude={[user.id]} />
        </div>
        <label>
          Deine Frage
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={CATEGORIES[category].placeholder} maxLength={200} required />
        </label>
        <div className="row">
          <label>Wann? <span className="hint">(optional)</span><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
        </div>
        {date && (
          <div className="row">
            <label>Von<input type="time" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
            <label>Bis<input type="time" value={to} onChange={(e) => setTo(e.target.value)} /></label>
          </div>
        )}
        <label>
          Details <span className="hint">(optional)</span>
          <textarea value={details} onChange={(e) => setDetails(e.target.value)} rows={2} maxLength={1000} placeholder="z. B. Wo, mit wem, wie komme ich hin …" />
        </label>
        {error && <p className="error">{error}</p>}
        <div className="form-actions">
          <span className="spacer" />
          <button type="button" className="button" onClick={onClose}>Abbrechen</button>
          <button className="button primary" disabled={busy || !title.trim()}><Icon name="send" size={18} /> Fragen</button>
        </div>
      </form>
    </Modal>
  );
}

type Answer = 'approve' | 'decline' | 'counter';

function RequestCard({ request: r, base, onChanged }: { request: FamilyRequest; base: string; onChanged(): void }) {
  const { user, member } = useFamily();
  const { isManager } = usePermissions();
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [note, setNote] = useState('');
  const [counterDate, setCounterDate] = useState(r.date ?? '');
  const [counterFrom, setCounterFrom] = useState(r.time_from ?? '');
  const [counterTo, setCounterTo] = useState(r.time_to ?? '');
  const { busy, error, run } = useAsync();
  const from = member(r.created_by) ?? FORMER;
  const to = member(r.recipient_id) ?? FORMER;
  const mine = r.created_by === user.id;
  const askedMe = r.recipient_id === user.id;
  const cat = CATEGORIES[r.category] ?? CATEGORIES.general;
  const when = whenLabel(r.date, r.time_from, r.time_to);
  const counterWhen = whenLabel(r.counter_date, r.counter_time_from, r.counter_time_to);
  const finalDate = r.counter_accepted ? r.counter_date ?? r.date : r.date;

  const post = (path: string, body?: unknown) =>
    void run(async () => {
      await api(`${base}/${r.id}${path}`, { method: 'POST', body });
      setAnswer(null);
      onChanged();
    });

  const sendAnswer = () =>
    post('/respond', {
      decision: answer,
      note,
      ...(answer === 'counter' && {
        counter_date: counterDate || null,
        counter_time_from: counterDate && counterFrom ? counterFrom : null,
        counter_time_to: counterDate && counterTo ? counterTo : null,
      }),
    });

  return (
    <article className={`card request status-${r.status}`}>
      <header className="request-head">
        <span className="request-emoji" aria-hidden="true">{cat.emoji}</span>
        <span className="request-title">
          <strong>{r.title}</strong>
          <small className="muted">
            {mine ? 'Du fragst' : `${first(from.name)} fragt`} {askedMe ? 'dich' : first(to.name)} · {formatTimestamp(r.created_at)}
          </small>
        </span>
        <span className="request-people" aria-hidden="true">
          <Avatar member={from} size={26} />
          <Avatar member={to} size={26} />
        </span>
      </header>

      {(when || r.details) && (
        <div className="request-info">
          {when && <span className="request-when"><Icon name="calendar" size={15} /> {when}</span>}
          {r.details && <p>{r.details}</p>}
        </div>
      )}

      <div className={`request-status ${STATUS[r.status].className}`}>
        <span className="request-status-label">{r.counter_accepted ? 'Ja – mit Gegenvorschlag ✅' : STATUS[r.status].label}</span>
        {r.status !== 'pending' && r.status !== 'withdrawn' && (r.response_note || counterWhen) && (
          <span className="request-answer">
            <strong>{first(to.name)}:</strong> {r.response_note}
            {counterWhen && <span className="request-when"><Icon name="calendar" size={15} /> {counterWhen}</span>}
          </span>
        )}
      </div>

      {/* Antwort der gefragten Person */}
      {askedMe && r.status === 'pending' && !answer && (
        <div className="request-actions">
          <button className="button small answer-yes" onClick={() => setAnswer('approve')}><Icon name="check" size={16} /> Ja</button>
          <button className="button small answer-counter" onClick={() => setAnswer('counter')}><Icon name="repeat" size={16} /> Gegenvorschlag</button>
          <button className="button small answer-no" onClick={() => setAnswer('decline')}><Icon name="close" size={16} /> Nein</button>
        </div>
      )}
      {answer && (
        <div className="form request-answer-form">
          <label>
            {answer === 'approve' ? 'Notiz (optional)' : answer === 'decline' ? 'Begründung (optional)' : 'Dein Vorschlag'}
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              maxLength={1000}
              autoFocus
              required={answer === 'counter'}
              placeholder={answer === 'approve' ? 'z. B. Aber um 18 Uhr bist du zurück!' : answer === 'decline' ? 'z. B. Morgen ist Schule.' : 'z. B. Lieber am Samstag, dann fahre ich dich.'}
            />
          </label>
          {answer === 'counter' && (
            <div className="row">
              <label>Tag<input type="date" value={counterDate} onChange={(e) => setCounterDate(e.target.value)} /></label>
              <label>Von<input type="time" value={counterFrom} onChange={(e) => setCounterFrom(e.target.value)} disabled={!counterDate} /></label>
              <label>Bis<input type="time" value={counterTo} onChange={(e) => setCounterTo(e.target.value)} disabled={!counterDate} /></label>
            </div>
          )}
          <div className="form-actions">
            <span className="spacer" />
            <button type="button" className="button small" onClick={() => setAnswer(null)} disabled={busy}>Zurück</button>
            <button
              type="button"
              className={`button small ${answer === 'decline' ? 'danger' : 'primary'}`}
              onClick={sendAnswer}
              disabled={busy || (answer === 'counter' && !note.trim())}
            >
              {answer === 'approve' ? 'Ja sagen' : answer === 'decline' ? 'Ablehnen' : 'Vorschlag schicken'}
            </button>
          </div>
        </div>
      )}

      {/* Der Fragende: Gegenvorschlag annehmen, zurückziehen, in den Kalender */}
      {mine && r.status === 'countered' && (
        <div className="request-actions">
          <button className="button small answer-yes" onClick={() => post('/counter', { accept: true })} disabled={busy}><Icon name="check" size={16} /> Vorschlag annehmen</button>
          <button className="button small answer-no" onClick={() => post('/counter', { accept: false })} disabled={busy}><Icon name="close" size={16} /> Ablehnen</button>
        </div>
      )}
      {mine && r.status === 'approved' && finalDate && (
        <div className="request-actions">
          {r.event_id ? (
            <Link className="link-button" to="/kalender"><Icon name="calendar" size={16} /> Steht im Kalender</Link>
          ) : (
            <button className="button small" onClick={() => post('/calendar')} disabled={busy}><Icon name="calendar" size={16} /> In den Kalender</button>
          )}
        </div>
      )}
      {error && <p className="error">{error}</p>}

      {(mine || isManager) && (
        <footer className="request-footer">
          {mine && (r.status === 'pending' || r.status === 'countered') && (
            <button className="link-button" onClick={() => confirm('Anfrage zurückziehen?') && post('/withdraw')} disabled={busy}>Zurückziehen</button>
          )}
          <span className="spacer" />
          {r.status !== 'pending' && r.status !== 'countered' && (
            <button
              className="icon-button subtle"
              aria-label="Anfrage löschen"
              disabled={busy}
              onClick={() => confirm('Anfrage löschen?') && void run(async () => {
                await api(`${base}/${r.id}`, { method: 'DELETE' });
                onChanged();
              })}
            >
              <Icon name="trash" size={16} />
            </button>
          )}
        </footer>
      )}
    </article>
  );
}

type Tab = 'inbox' | 'mine' | 'all';

export function RequestsPage() {
  const { user, family } = useFamily();
  const { isManager } = usePermissions();
  const { base, items, loading, reload, needsMe } = useRequests();
  const [creating, setCreating] = useState(false);
  const [tab, setTab] = useState<Tab>('inbox');

  const inbox = items.filter((r) => r.recipient_id === user.id);
  const mine = items.filter((r) => r.created_by === user.id);
  const shown = tab === 'inbox' ? inbox : tab === 'mine' ? mine : items;
  const openInbox = inbox.filter((r) => r.status === 'pending').length;
  const openMine = mine.filter((r) => r.status === 'countered').length;
  const canAsk = family.members.length > 1;

  return (
    <div className="page narrow">
      <header className="page-header">
        <h1>Anfragen</h1>
        {canAsk && <button className="button primary" onClick={() => setCreating(true)}><Icon name="plus" /> Anfrage</button>}
      </header>

      <div className="segmented" role="tablist">
        <button role="tab" aria-selected={tab === 'inbox'} className={tab === 'inbox' ? 'active' : ''} onClick={() => setTab('inbox')}>
          An mich {openInbox > 0 && <span className="badge">{openInbox}</span>}
        </button>
        <button role="tab" aria-selected={tab === 'mine'} className={tab === 'mine' ? 'active' : ''} onClick={() => setTab('mine')}>
          Meine {openMine > 0 && <span className="badge">{openMine}</span>}
        </button>
        {isManager && (
          <button role="tab" aria-selected={tab === 'all'} className={tab === 'all' ? 'active' : ''} onClick={() => setTab('all')}>Alle</button>
        )}
      </div>

      {needsMe.length > 0 && tab === 'all' && <p className="hint">{needsMe.length} Anfrage{needsMe.length > 1 ? 'n warten' : ' wartet'} auf dich.</p>}

      {!loading && shown.length === 0 ? (
        <div className="card">
          <EmptyState icon="request" title={tab === 'inbox' ? 'Niemand hat dich etwas gefragt' : 'Noch keine Anfragen'}>
            {canAsk ? 'Frag zum Beispiel, ob du dich mit Freunden treffen darfst oder ihr am Wochenende frei habt.' : 'Lade zuerst weitere Familienmitglieder ein.'}
          </EmptyState>
        </div>
      ) : (
        shown.map((r) => <RequestCard key={r.id} request={r} base={base} onChanged={() => void reload()} />)
      )}

      {creating && (
        <NewRequestForm
          base={base}
          onClose={() => setCreating(false)}
          onDone={() => {
            setTab('mine');
            void reload();
          }}
        />
      )}
    </div>
  );
}

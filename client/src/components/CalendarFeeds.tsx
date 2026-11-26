import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../api';
import { useFamily } from '../session';
import { Icon } from './Icon';
import { useAsync } from './useAsync';

type Visibility = 'private' | 'family' | 'custom';
interface Feed {
  id: number;
  name: string;
  url: string;
  visibility: Visibility;
  viewer_ids: number[];
  member_ids: number[];
  last_sync_at: string | null;
  last_error: string | null;
  event_count: number;
}

const VISIBILITY: { value: Visibility; label: string }[] = [
  { value: 'private', label: '🔒 Nur ich' },
  { value: 'family', label: '👨‍👩‍👧 Ganze Familie' },
  { value: 'custom', label: '👥 Ausgewählte Personen' },
];

const when = (sqlUtc: string | null) => {
  if (!sqlUtc) return 'noch nie';
  const d = new Date(`${sqlUtc.replace(' ', 'T')}Z`);
  return d.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
};

/** Wer sieht die Termine, wem gehören sie – für Neuanlage und Bearbeiten */
function FeedFields({ value, onChange }: { value: Pick<Feed, 'name' | 'visibility' | 'viewer_ids' | 'member_ids'> & { url?: string }; onChange(v: Partial<Feed>): void }) {
  const { family, user } = useFamily();
  const others = family.members.filter((m) => m.id !== user.id);
  const toggle = (list: number[], id: number) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  return (
    <>
      <label>Name in der App<input value={value.name} onChange={(e) => onChange({ name: e.target.value })} placeholder="z. B. Familie oder Privat" maxLength={60} required /></label>
      {value.url !== undefined && (
        <label>Privatadresse im iCal-Format
          <input value={value.url} onChange={(e) => onChange({ url: e.target.value })} placeholder="https://calendar.google.com/calendar/ical/…/private-…/basic.ics" required autoComplete="off" />
        </label>
      )}
      <fieldset className="plain-fieldset">
        <legend>Wer darf die Termine sehen?</legend>
        <div className="segmented">
          {VISIBILITY.map((v) => (
            <button key={v.value} type="button" className={value.visibility === v.value ? 'active' : ''} onClick={() => onChange({ visibility: v.value })}>{v.label}</button>
          ))}
        </div>
        {value.visibility === 'custom' && (
          <div className="feed-people">
            {others.map((m) => (
              <label key={m.id} className="checkbox">
                <input type="checkbox" checked={value.viewer_ids.includes(m.id)} onChange={() => onChange({ viewer_ids: toggle(value.viewer_ids, m.id) })} /> {m.name}
              </label>
            ))}
          </div>
        )}
      </fieldset>
      <fieldset className="plain-fieldset">
        <legend>Termine gehören zu</legend>
        <div className="feed-people">
          {family.members.map((m) => (
            <label key={m.id} className="checkbox">
              <input type="checkbox" checked={value.member_ids.includes(m.id)} onChange={() => onChange({ member_ids: toggle(value.member_ids, m.id) })} /> {m.name}
            </label>
          ))}
        </div>
        <small className="hint">Bestimmt die Farbe und die runden Bilder am Termin im Kalender.</small>
      </fieldset>
    </>
  );
}

function FeedCard({ feed, onChanged, onRemoved }: { feed: Feed; onChanged(f: Feed): void; onRemoved(): void }) {
  const { family } = useFamily();
  const [edit, setEdit] = useState<Feed | null>(null);
  const { busy, error, run } = useAsync();
  const path = `/families/${family.id}/calendar-feeds/${feed.id}`;
  const label = VISIBILITY.find((v) => v.value === feed.visibility)?.label;
  const viewers = feed.visibility === 'custom' ? family.members.filter((m) => feed.viewer_ids.includes(m.id)).map((m) => m.name.split(' ')[0]).join(', ') : '';

  if (edit) {
    return (
      <form className="climate-device selected" onSubmit={(e: FormEvent) => {
        e.preventDefault();
        void run(async () => {
          const { name, visibility, viewer_ids, member_ids, url } = edit;
          onChanged(await api<Feed>(path, { method: 'PATCH', body: { name, visibility, viewer_ids, member_ids, ...(url !== feed.url && { url }) } }));
          setEdit(null);
        });
      }}>
        <FeedFields value={edit} onChange={(v) => setEdit({ ...edit, ...v })} />
        {error && <p className="error">{error}</p>}
        <div className="form-actions">
          <button type="button" className="button danger" disabled={busy} onClick={() => confirm(`Kalender „${feed.name}“ trennen? Seine Termine verschwinden aus der App (im Google Kalender bleiben sie).`) && void run(async () => {
            await api(path, { method: 'DELETE' });
            onRemoved();
          })}>Trennen</button>
          <span className="spacer" />
          <button type="button" className="button" onClick={() => setEdit(null)}>Abbrechen</button>
          <button className="button primary" disabled={busy}>Speichern</button>
        </div>
      </form>
    );
  }
  return (
    <div className="climate-device">
      <div className="row align-center">
        <strong className="spacer">📅 {feed.name}</strong>
        <button type="button" className="icon-button" onClick={() => setEdit(feed)} aria-label={`${feed.name} bearbeiten`}><Icon name="edit" size={18} /></button>
      </div>
      <p className="muted">{label}{viewers && `: ${viewers}`} · {feed.event_count} Termine · abgeglichen {when(feed.last_sync_at)}</p>
      {feed.last_error && <p className="error">✗ {feed.last_error}</p>}
      {error && <p className="error">{error}</p>}
      <button type="button" className="button small" disabled={busy} onClick={() => void run(async () => onChanged(await api<Feed>(`${path}/sync`, { method: 'POST' })))}>
        <Icon name="repeat" size={16} /> {busy ? 'Gleiche ab …' : 'Jetzt abgleichen'}
      </button>
    </div>
  );
}

/** Familie & Profil → Kalender verbinden: eigene Google-Kalender (iCal-Adresse) mit Sichtbarkeit */
export function CalendarFeeds() {
  const { family, user } = useFamily();
  const base = `/families/${family.id}/calendar-feeds`;
  const [feeds, setFeeds] = useState<Feed[] | null>(null);
  const [adding, setAdding] = useState(false);
  const empty = { name: '', url: '', visibility: 'private' as Visibility, viewer_ids: [] as number[], member_ids: [user.id] };
  const [draft, setDraft] = useState(empty);
  const { busy, error, run } = useAsync();

  useEffect(() => {
    void api<Feed[]>(base).then(setFeeds, () => setFeeds([]));
  }, [base]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      const created = await api<Feed>(base, { method: 'POST', body: draft });
      setFeeds((f) => [...(f ?? []), created]);
      setDraft(empty);
      setAdding(false);
    });
  };

  return (
    <div className="climate-settings">
      <p className="muted">Termine aus deinem Google Kalender erscheinen hier in der App – du bestimmst pro Kalender, wer sie sehen darf. Ändern geht weiter im Google Kalender; die App gleicht alle 15 Minuten ab.</p>
      {feeds?.map((f) => (
        <FeedCard key={f.id} feed={f}
          onChanged={(n) => setFeeds((all) => all?.map((x) => (x.id === n.id ? n : x)) ?? [n])}
          onRemoved={() => setFeeds((all) => all?.filter((x) => x.id !== f.id) ?? [])} />
      ))}
      {!adding ? (
        <button type="button" className="button" onClick={() => setAdding(true)}><Icon name="plus" size={18} /> Google Kalender verbinden</button>
      ) : (
        <form className="climate-device selected" onSubmit={submit}>
          <details className="feed-help" open>
            <summary>So findest du die Adresse</summary>
            <ol>
              <li>Am PC <b>calendar.google.com</b> öffnen (in der Handy-App geht es nicht).</li>
              <li>Links beim Kalender auf <b>⋮ → Einstellungen und Freigabe</b>.</li>
              <li>Ganz nach unten zu <b>„Kalender integrieren“</b>.</li>
              <li><b>„Privatadresse im iCal-Format“</b> kopieren und unten einfügen.</li>
            </ol>
            <small className="hint">Die Adresse ist wie ein Schlüssel: Wer sie kennt, kann den Kalender lesen. Sie liegt nur auf eurem Server und nur du siehst sie hier. Bitte nirgends sonst teilen. Für jeden Kalender (z. B. „Familie“ und „Privat“) einzeln verbinden.</small>
          </details>
          <FeedFields value={draft} onChange={(v) => setDraft({ ...draft, ...v } as typeof draft)} />
          {error && <p className="error">{error}</p>}
          <div className="form-actions">
            <span className="spacer" />
            <button type="button" className="button" onClick={() => setAdding(false)}>Abbrechen</button>
            <button className="button primary" disabled={busy}>{busy ? 'Verbinde …' : 'Verbinden'}</button>
          </div>
        </form>
      )}
    </div>
  );
}

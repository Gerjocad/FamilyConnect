import { useState, type FormEvent } from 'react';
import { Avatar } from '../components/Avatar';
import { EmptyState } from '../components/EmptyState';
import { Icon } from '../components/Icon';
import { MemberPicker } from '../components/MemberPicker';
import { Modal } from '../components/Modal';
import { useAsync } from '../components/useAsync';
import { allOccurrences, choreOccurrences, choreRhythm, useChores, type ChoreOccurrence } from '../chores';
import { binEmoji, parseIcs, type IcsGroup } from '../ics';
import { addDays, formatRelativeDay, startOfDay, toDateKey } from '../dates';
import { usePermissions } from '../permissions';
import { useFamily } from '../session';
import type { Chore } from '../types';

// Vorlagen für den schnellen Start – vor allem die Müllabfuhr
const PRESETS = [
  { emoji: '🗑️', title: 'Restmüll' },
  { emoji: '♻️', title: 'Gelber Sack' },
  { emoji: '📰', title: 'Papiertonne' },
  { emoji: '🌿', title: 'Biotonne' },
  { emoji: '🍽️', title: 'Spülmaschine ausräumen' },
  { emoji: '🧺', title: 'Wäsche aufhängen' },
  { emoji: '🍴', title: 'Tisch decken' },
  { emoji: '🐶', title: 'Mit dem Hund raus' },
];
const EMOJIS = ['🗑️', '♻️', '📰', '🌿', '🍾', '🍽️', '🧺', '🍴', '🧹', '🐶', '🪴', '🛁'];
const REMIND_LABELS: Record<Chore['remind'], string> = {
  evening: 'Am Vorabend um 19 Uhr',
  morning: 'Am Tag um 7 Uhr',
  none: 'Keine Erinnerung',
};

function ChoreForm({ chore, onSave, onDelete, onClose }: {
  chore?: Chore;
  onSave(data: Partial<Chore>): Promise<unknown>;
  onDelete?(): Promise<unknown>;
  onClose(): void;
}) {
  const [title, setTitle] = useState(chore?.title ?? '');
  const [emoji, setEmoji] = useState(chore?.emoji ?? '🗑️');
  const [startDate, setStartDate] = useState(chore?.start_date ?? toDateKey(new Date()));
  const [interval, setInterval] = useState(chore?.interval_weeks ?? 1);
  const [memberIds, setMemberIds] = useState<number[]>(chore?.member_ids ?? []);
  const [remind, setRemind] = useState<Chore['remind']>(chore?.remind ?? 'evening');
  const [notes, setNotes] = useState(chore?.notes ?? '');
  const { busy, error, run } = useAsync();
  const { member } = useFamily();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      await onSave({ title, emoji, start_date: startDate, interval_weeks: interval, member_ids: memberIds, remind, notes });
      onClose();
    });
  };

  return (
    <Modal title={chore ? 'Dienst bearbeiten' : 'Neuer Dienst'} onClose={onClose}>
      <form className="form" onSubmit={submit}>
        {!chore && (
          <div className="field">
            <span>Vorlage</span>
            <div className="filter-bar">
              {PRESETS.map((p) => (
                <button type="button" key={p.title} className={`chip ${title === p.title ? 'chip-active' : ''}`} onClick={() => { setTitle(p.title); setEmoji(p.emoji); }}>
                  {p.emoji} {p.title}
                </button>
              ))}
            </div>
          </div>
        )}
        <label>Was?<input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="z. B. Gelber Sack" required /></label>
        <div className="field">
          <span>Symbol</span>
          <div className="emoji-picker">
            {EMOJIS.map((em) => (
              <button type="button" key={em} className={`emoji ${emoji === em ? 'active' : ''}`} onClick={() => setEmoji(em)} aria-pressed={emoji === em}>{em}</button>
            ))}
          </div>
        </div>
        {chore?.dates.length ? (
          <p className="hint">Termine kommen aus dem Abfallkalender ({chore.dates.length} Stück, bis {formatRelativeDay(chore.dates[chore.dates.length - 1])}). Für ein neues Jahr einfach den neuen Kalender importieren.</p>
        ) : (
        <>
        <div className="row">
          <label>
            Nächster Termin
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
          </label>
          <label>
            Wie oft?
            <select value={interval} onChange={(e) => setInterval(Number(e.target.value))}>
              {[1, 2, 3, 4, 6, 8].map((w) => <option key={w} value={w}>{w === 1 ? 'Jede Woche' : `Alle ${w} Wochen`}</option>)}
            </select>
          </label>
        </div>
        <small className="hint">Bei der Müllabfuhr: der Abholtag. Die Erinnerung kommt dann am Abend vorher.</small>
        </>
        )}
        <div className="field">
          <span>Wer ist dran? <small className="hint">(der Reihe nach – in der Reihenfolge, in der du antippst)</small></span>
          <MemberPicker value={memberIds} onChange={setMemberIds} />
          {memberIds.length > 1 && (
            <small className="muted">Reihenfolge: {memberIds.map((id) => member(id)?.name.split(' ')[0]).join(' → ')} → …</small>
          )}
        </div>
        <label>
          Erinnerung
          <select value={remind} onChange={(e) => setRemind(e.target.value as Chore['remind'])}>
            {(Object.keys(REMIND_LABELS) as Chore['remind'][]).map((r) => <option key={r} value={r}>{REMIND_LABELS[r]}</option>)}
          </select>
        </label>
        <label>Notiz<input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="z. B. Tonne steht hinter der Garage" /></label>
        {error && <p className="error">{error}</p>}
        <div className="form-actions">
          {onDelete && (
            <button type="button" className="button danger" onClick={() => confirm('Dienst löschen?') && void run(async () => {
              await onDelete();
              onClose();
            })}>
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

/** Abfallkalender (.ics) übernehmen: je Abfallart ein Dienst mit festen Terminen */
function ImportDialog({ chores, onImport, onClose }: {
  chores: Chore[];
  onImport(items: { group: IcsGroup; emoji: string; existing?: Chore }[], memberIds: number[], remind: Chore['remind']): Promise<void>;
  onClose(): void;
}) {
  const [groups, setGroups] = useState<IcsGroup[] | null>(null);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [memberIds, setMemberIds] = useState<number[]>([]);
  const [remind, setRemind] = useState<Chore['remind']>('evening');
  const { busy, error, run, setError } = useAsync();
  const today = toDateKey(new Date());

  const read = (file: File | undefined) => {
    if (!file) return;
    void run(async () => {
      const parsed = parseIcs(await file.text());
      if (parsed.length === 0) return setError('In der Datei wurden keine Termine gefunden');
      setGroups(parsed);
      // Abfallarten ohne kommende Termine (z. B. Weihnachtsbaum im Herbst) nicht vorauswählen
      setChosen(new Set(parsed.filter((g) => g.dates.some((d) => d >= today)).map((g) => g.title)));
    });
  };

  return (
    <Modal title="Abfallkalender importieren" onClose={onClose}>
      <div className="form">
        {!groups ? (
          <>
            <p className="muted">
              Wähle die Kalenderdatei (.ics) deines Entsorgers. Die gibt es meist auf dessen Website zum Download,
              wenn man dort den Abfuhrkalender für die eigene Adresse aufruft.
            </p>
            <label className="button primary file-button">
              <Icon name="download" size={18} /> Datei auswählen
              <input type="file" accept=".ics,text/calendar" hidden onChange={(e) => read(e.target.files?.[0])} />
            </label>
          </>
        ) : (
          <>
            <div className="field">
              <span>Was soll übernommen werden?</span>
              {groups.map((g) => {
                const existing = chores.find((c) => c.title.toLowerCase() === g.title.toLowerCase());
                const next = g.dates.find((d) => d >= today);
                return (
                  <label key={g.title} className="checkbox import-row">
                    <input type="checkbox" checked={chosen.has(g.title)} onChange={(e) => {
                      const set = new Set(chosen);
                      if (e.target.checked) set.add(g.title); else set.delete(g.title);
                      setChosen(set);
                    }} />
                    <span>
                      {binEmoji(g.title)} <strong>{g.title}</strong>
                      <small className="muted"> · {g.dates.length} {g.dates.length === 1 ? 'Termin' : 'Termine'}{next ? ` · nächster ${formatRelativeDay(next)}` : ' · alle schon vorbei'}{existing ? ' · ersetzt die bisherigen' : ''}</small>
                    </span>
                  </label>
                );
              })}
            </div>
            <div className="field">
              <span>Wer stellt raus? <small className="hint">(der Reihe nach; leer = nur Erinnerung für alle)</small></span>
              <MemberPicker value={memberIds} onChange={setMemberIds} />
              <small className="hint">Bei bestehenden Diensten bleibt die bisherige Reihenfolge, wenn hier niemand gewählt ist.</small>
            </div>
            <label>
              Erinnerung
              <select value={remind} onChange={(e) => setRemind(e.target.value as Chore['remind'])}>
                {(Object.keys(REMIND_LABELS) as Chore['remind'][]).map((r) => <option key={r} value={r}>{REMIND_LABELS[r]}</option>)}
              </select>
            </label>
          </>
        )}
        {error && <p className="error">{error}</p>}
        <div className="form-actions">
          <span className="spacer" />
          <button type="button" className="button" onClick={onClose}>Abbrechen</button>
          {groups && (
            <button className="button primary" disabled={busy || chosen.size === 0} onClick={() => void run(async () => {
              const items = groups.filter((g) => chosen.has(g.title)).map((group) => ({
                group,
                emoji: binEmoji(group.title),
                existing: chores.find((c) => c.title.toLowerCase() === group.title.toLowerCase()),
              }));
              await onImport(items, memberIds, remind);
              onClose();
            })}>
              {chosen.size} übernehmen
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}

/** Eine Zeile: Tag, wer dran ist, abhaken / tauschen */
export function OccurrenceRow({ occ, onDone, onSwap, showTitle = false }: {
  occ: ChoreOccurrence;
  onDone(done: boolean): void;
  onSwap?(): void;
  showTitle?: boolean;
}) {
  const { user, member } = useFamily();
  const { isManager } = usePermissions();
  const who = member(occ.assignee);
  const mine = occ.assignee === user.id;
  const canToggle = mine || isManager || occ.assignee === null;
  const done = occ.doneBy !== null;
  const today = toDateKey(new Date());
  return (
    <li className={`chore-row ${done ? 'done' : ''} ${mine ? 'mine' : ''} ${occ.date === today ? 'today' : ''}`}>
      <span className="chore-day">
        {showTitle && <strong>{occ.chore.emoji} {occ.chore.title}</strong>}
        <span>{formatRelativeDay(occ.date)}</span>
      </span>
      <span className="chore-who">
        {who ? <><Avatar member={who} size={24} /> {mine ? 'Du' : who.name.split(' ')[0]}</> : <span className="muted">Alle</span>}
        {occ.swapped && <small className="muted" title="getauscht">↔</small>}
      </span>
      {onSwap && (mine || isManager) && !done && (
        <button className="icon-button subtle" onClick={onSwap} aria-label="Termin tauschen"><Icon name="repeat" size={16} /></button>
      )}
      <button
        className={`check-button ${done ? 'done' : ''}`}
        disabled={!canToggle}
        onClick={() => onDone(!done)}
        aria-label={done ? `${occ.chore.title} zurücknehmen` : `${occ.chore.title} erledigt`}
      >
        <Icon name="check" size={18} />
      </button>
    </li>
  );
}

function SwapDialog({ occ, onPick, onClose }: { occ: ChoreOccurrence; onPick(userId: number): Promise<unknown>; onClose(): void }) {
  const [picked, setPicked] = useState<number[]>(occ.assignee ? [occ.assignee] : []);
  const { busy, error, run } = useAsync();
  return (
    <Modal title={`${occ.chore.emoji} ${occ.chore.title} · ${formatRelativeDay(occ.date)}`} onClose={onClose}>
      <div className="form">
        <div className="field">
          <span>Wer übernimmt diesmal?</span>
          <MemberPicker value={picked} onChange={setPicked} single />
        </div>
        <small className="hint">Gilt nur für diesen Termin – danach geht es normal der Reihe nach weiter.</small>
        {error && <p className="error">{error}</p>}
        <div className="form-actions">
          <span className="spacer" />
          <button type="button" className="button" onClick={onClose}>Abbrechen</button>
          <button className="button primary" disabled={busy || !picked[0] || picked[0] === occ.assignee} onClick={() => void run(async () => {
            await onPick(picked[0]);
            onClose();
          })}>
            Übergeben
          </button>
        </div>
      </div>
    </Modal>
  );
}

export function ChoresPage() {
  const { user } = useFamily();
  const { isManager } = usePermissions();
  const { chores, days, setDone, assign } = useChores();
  const [editing, setEditing] = useState<Chore | 'new' | null>(null);
  const [swapping, setSwapping] = useState<ChoreOccurrence | null>(null);
  const [importing, setImporting] = useState(false);
  const { error, run } = useAsync();
  const today = toDateKey(new Date());
  const in6Weeks = toDateKey(addDays(startOfDay(new Date()), 42));
  // Was diese Woche bei mir ansteht
  const mine = allOccurrences(chores.items, today, toDateKey(addDays(startOfDay(new Date()), 7)), days)
    .filter((o) => o.assignee === user.id && o.doneBy === null);

  const toggle = (o: ChoreOccurrence, done: boolean) => void run(() => setDone(o, done));

  return (
    <div className="page narrow">
      <header className="page-header">
        <h1>Dienste</h1>
        {isManager && <button className="button primary" onClick={() => setEditing('new')}><Icon name="plus" /> Dienst</button>}
      </header>
      {isManager && (
        <button className="link-button import-link" onClick={() => setImporting(true)}>
          <Icon name="download" size={16} /> Abfallkalender importieren (.ics)
        </button>
      )}
      {error && <p className="error">{error}</p>}

      {mine.length > 0 && (
        <section className="card chores-mine">
          <h2><Icon name="task" size={18} /> Bei dir diese Woche</h2>
          <ul className="chore-list">
            {mine.map((o) => <OccurrenceRow key={`${o.chore.id}-${o.date}`} occ={o} showTitle onDone={(d) => toggle(o, d)} onSwap={() => setSwapping(o)} />)}
          </ul>
        </section>
      )}

      {!chores.loading && chores.items.length === 0 ? (
        <div className="card">
          <EmptyState icon="chore" title="Noch keine Dienste">
            {isManager
              ? 'Leg z. B. die Müllabfuhr an – mit Abholtag, Rhythmus und wer der Reihe nach rausstellt.'
              : 'Dienste wie „Müll rausbringen“ legen deine Eltern an.'}
          </EmptyState>
        </div>
      ) : (
        chores.items.map((chore) => {
          // Ein gestern offen gebliebener Termin bleibt sichtbar, dann die nächsten
          const recent = choreOccurrences(chore, toDateKey(addDays(startOfDay(new Date()), -1)), today, days)
            .filter((o) => o.date < today && o.doneBy === null);
          const upcoming = choreOccurrences(chore, today, in6Weeks, days).slice(0, 4);
          return (
            <section key={chore.id} className="card chore-card">
              <header className="section-header">
                <span className="habit-emoji">{chore.emoji || '✔️'}</span>
                <span className="habit-title">
                  <h2>{chore.title}</h2>
                  <small className="muted">{choreRhythm(chore)}{chore.notes && ` · ${chore.notes}`}</small>
                </span>
                <span className="spacer" />
                {isManager && <button className="icon-button" onClick={() => setEditing(chore)} aria-label="Bearbeiten"><Icon name="edit" size={18} /></button>}
              </header>
              <ul className="chore-list">
                {[...recent, ...upcoming].map((o) => (
                  <OccurrenceRow key={o.date} occ={o} onDone={(d) => toggle(o, d)} onSwap={() => setSwapping(o)} />
                ))}
              </ul>
            </section>
          );
        })
      )}

      {editing && (
        <ChoreForm
          chore={editing === 'new' ? undefined : editing}
          onClose={() => setEditing(null)}
          onSave={(data) => (editing === 'new' ? chores.create(data) : chores.update(editing.id, data))}
          onDelete={editing === 'new' ? undefined : () => chores.remove(editing.id)}
        />
      )}
      {importing && (
        <ImportDialog
          chores={chores.items}
          onClose={() => setImporting(false)}
          onImport={async (items, memberIds, remind) => {
            for (const { group, emoji, existing } of items) {
              const data = { dates: group.dates, remind, ...(memberIds.length > 0 && { member_ids: memberIds }) };
              if (existing) await chores.update(existing.id, data);
              else await chores.create({ title: group.title, emoji, start_date: group.dates[0], interval_weeks: 1, member_ids: memberIds, ...data });
            }
          }}
        />
      )}
      {swapping && <SwapDialog occ={swapping} onClose={() => setSwapping(null)} onPick={(id) => assign(swapping, id)} />}
    </div>
  );
}

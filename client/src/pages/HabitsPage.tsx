import { useState, type FormEvent } from 'react';
import { api } from '../api';
import { Avatar } from '../components/Avatar';
import { EmptyState } from '../components/EmptyState';
import { Icon } from '../components/Icon';
import { MemberPicker } from '../components/MemberPicker';
import { Modal } from '../components/Modal';
import { useAsync } from '../components/useAsync';
import { addDays, startOfDay, toDateKey, WEEKDAYS_SHORT } from '../dates';
import { habitParticipants, habitStatus, intervalLabel, nfcUrl, statusLabel } from '../habitStatus';
import { useFamily } from '../session';
import type { Checkin, Habit, Member } from '../types';
import { useCheckins } from '../useCheckins';
import { useResource } from '../useResource';

const EMOJIS = ['🚿', '🦷', '🛏️', '💊', '🏃', '📚', '🧹', '🐶', '💧', '🥦', '🎹', '🧺'];
const INTERVALS = [1, 2, 3, 4, 5, 7, 14, 30];

function HabitForm({ habit, onSave, onDelete, onClose }: {
  habit?: Habit;
  onSave(data: Partial<Habit>): Promise<unknown>;
  onDelete?(): Promise<unknown>;
  onClose(): void;
}) {
  const { family } = useFamily();
  const [title, setTitle] = useState(habit?.title ?? '');
  const [emoji, setEmoji] = useState(habit?.emoji ?? '🚿');
  const [interval, setInterval] = useState(habit?.interval_days ?? 1);
  const [memberIds, setMemberIds] = useState<number[]>(habit?.member_ids ?? []);
  const [reminder, setReminder] = useState(habit?.reminder_time ?? '');
  const [token, setToken] = useState(habit?.nfc_token);
  const [copied, setCopied] = useState(false);
  const { busy, error, run } = useAsync();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      await onSave({ title, emoji, interval_days: interval, member_ids: memberIds, reminder_time: reminder || null });
      onClose();
    });
  };

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Text ist sichtbar und kann markiert werden
    }
  };

  return (
    <Modal title={habit ? 'Gewohnheit bearbeiten' : 'Neue Gewohnheit'} onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <label>
          Was?
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="z. B. Duschen" required autoFocus />
        </label>
        <div className="field">
          <span>Symbol</span>
          <div className="emoji-picker">
            {EMOJIS.map((em) => (
              <button type="button" key={em} className={`emoji ${emoji === em ? 'active' : ''}`} onClick={() => setEmoji(em)} aria-pressed={emoji === em}>
                {em}
              </button>
            ))}
          </div>
        </div>
        <div className="row">
          <label>
            Wie oft?
            <select value={interval} onChange={(e) => setInterval(Number(e.target.value))}>
              {[...new Set([...INTERVALS, interval])].sort((a, b) => a - b).map((d) => (
                <option key={d} value={d}>{intervalLabel(d)}</option>
              ))}
            </select>
          </label>
          <label>
            Erinnerung um
            <input type="time" value={reminder} onChange={(e) => setReminder(e.target.value)} />
          </label>
        </div>
        <div className="field">
          <span>Für wen? <small className="hint">(niemand ausgewählt = alle)</small></span>
          <MemberPicker value={memberIds} onChange={setMemberIds} />
        </div>

        {habit && token && (
          <div className="nfc-box">
            <strong><Icon name="nfc" size={18} /> NFC-Aufkleber</strong>
            <p className="muted">
              Schreibe diese Adresse mit der kostenlosen App <b>„NFC Tools“</b> auf einen Aufkleber
              (Schreiben → Datensatz hinzufügen → <b>Benutzerdefinierte URL / URI</b>). Wer sein Handy daranhält, hakt die Gewohnheit für sich ab.
            </p>
            <code className="nfc-url">{nfcUrl({ nfc_token: token })}</code>
            <div className="form-actions">
              <button type="button" className="button small" onClick={() => void copy(nfcUrl({ nfc_token: token }))}>
                <Icon name="copy" size={16} /> {copied ? 'Kopiert!' : 'Kopieren'}
              </button>
              <button
                type="button"
                className="button small"
                onClick={() => confirm('Neuen Code erzeugen? Bisherige Aufkleber funktionieren dann nicht mehr.') &&
                  void run(async () => {
                    const res = await api<{ nfc_token: string }>(`/families/${family.id}/habits/${habit.id}/nfc-token`, { method: 'POST' });
                    setToken(res.nfc_token);
                  })}
              >
                Neuer Code
              </button>
            </div>
          </div>
        )}

        {error && <p className="error">{error}</p>}
        <div className="form-actions">
          {onDelete && (
            <button type="button" className="button danger" onClick={() => confirm('Gewohnheit mit allen Einträgen löschen?') && void run(async () => {
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

/** Letzte 7 Tage als Punkte */
function WeekDots({ habit, userId, checkins }: { habit: Habit; userId: number; checkins: Checkin[] }) {
  const today = startOfDay(new Date());
  const done = new Set(checkins.filter((c) => c.habit_id === habit.id && c.user_id === userId).map((c) => c.date));
  return (
    <span className="week-dots" aria-label="Letzte 7 Tage">
      {Array.from({ length: 7 }, (_, i) => addDays(today, i - 6)).map((d) => (
        <span key={toDateKey(d)} className={`wd ${done.has(toDateKey(d)) ? 'on' : ''}`} title={WEEKDAYS_SHORT[(d.getDay() + 6) % 7]} />
      ))}
    </span>
  );
}

export function HabitRow({ habit, member, checkins, canToggle, onToggle }: {
  habit: Habit;
  member: Member;
  checkins: Checkin[];
  canToggle: boolean;
  onToggle(done: boolean): void;
}) {
  const s = habitStatus(habit, member.id, checkins);
  const due = !s.doneToday && s.dueIn <= 0;
  return (
    <div className={`habit-row ${due ? 'due' : ''}`}>
      <Avatar member={member} size={30} />
      <span className="habit-who">
        <strong>{member.name.split(' ')[0]}</strong>
        <small className={due ? 'overdue' : 'muted'}>{statusLabel(s)}</small>
      </span>
      {s.streak > 1 && <span className="streak" title="Serie">🔥 {s.streak}</span>}
      <WeekDots habit={habit} userId={member.id} checkins={checkins} />
      <button
        className={`check-button ${s.doneToday ? 'done' : ''}`}
        disabled={!canToggle}
        onClick={() => onToggle(s.doneToday)}
        aria-label={s.doneToday ? `${habit.title} für ${member.name} zurücknehmen` : `${habit.title} für ${member.name} erledigt`}
      >
        <Icon name="check" size={20} />
      </button>
    </div>
  );
}

export function HabitsPage() {
  const { family, user } = useFamily();
  const habits = useResource<Habit>('habits');
  const checkins = useCheckins();
  const [editing, setEditing] = useState<Habit | 'new' | null>(null);
  const isAdmin = family.members.find((m) => m.id === user.id)?.role === 'admin';
  const today = toDateKey(new Date());

  return (
    <div className="page narrow">
      <header className="page-header">
        <h1>Gewohnheiten</h1>
        <button className="button primary" onClick={() => setEditing('new')}><Icon name="plus" /> Gewohnheit</button>
      </header>

      {!habits.loading && habits.items.length === 0 ? (
        <div className="card">
          <EmptyState icon="habit" title="Noch keine Gewohnheiten">
            Zum Beispiel „Duschen alle 2 Tage“ oder „Zähne putzen täglich“ – abhaken per Knopfdruck oder NFC-Aufkleber.
          </EmptyState>
        </div>
      ) : (
        habits.items.map((habit) => (
          <section key={habit.id} className="card habit-card">
            <header className="section-header">
              <span className="habit-emoji">{habit.emoji || '✔️'}</span>
              <span className="habit-title">
                <h2>{habit.title}</h2>
                <small className="muted">
                  {intervalLabel(habit.interval_days)}
                  {habit.reminder_time && ` · Erinnerung ${habit.reminder_time} Uhr`}
                </small>
              </span>
              <span className="spacer" />
              <button className="icon-button" onClick={() => setEditing(habit)} aria-label="Bearbeiten"><Icon name="edit" size={18} /></button>
            </header>
            {habitParticipants(habit, family.members).map((m) => (
              <HabitRow
                key={m.id}
                habit={habit}
                member={m}
                checkins={checkins.items}
                canToggle={m.id === user.id || isAdmin}
                onToggle={(done) => void checkins.toggle(habit.id, m.id, today, done)}
              />
            ))}
          </section>
        ))
      )}

      {editing && (
        <HabitForm
          habit={editing === 'new' ? undefined : editing}
          onClose={() => setEditing(null)}
          onSave={(data) => (editing === 'new' ? habits.create(data) : habits.update(editing.id, data))}
          onDelete={editing === 'new' ? undefined : () => habits.remove(editing.id)}
        />
      )}
    </div>
  );
}

import { useState, type FormEvent } from 'react';
import { EventComments } from '../components/EventComments';
import { MemberPicker } from '../components/MemberPicker';
import { Modal } from '../components/Modal';
import { useAsync } from '../components/useAsync';
import { RECURRENCE_LABELS, REMINDER_LABELS, toDateTimeKey, type Occurrence } from '../dates';
import type { Scope } from '../eventSeries';
import type { CalendarEvent, Recurrence } from '../types';

interface Props {
  event?: CalendarEvent;
  /** das angeklickte Vorkommen, falls der Termin zu einer Serie gehört */
  occurrence?: Occurrence;
  defaultDay: Date;
  onSave(data: Partial<CalendarEvent>, scope: Scope): Promise<unknown>;
  onDelete?(scope: Scope): Promise<unknown>;
  onClose(): void;
  /** nur ansehen (Kinder bei Terminen anderer) */
  readOnly?: boolean;
}

function defaults(day: Date) {
  const now = new Date();
  const start = new Date(day.getFullYear(), day.getMonth(), day.getDate(), Math.min(now.getHours() + 1, 23), 0);
  return { start: toDateTimeKey(start), end: toDateTimeKey(new Date(start.getTime() + 3_600_000)), all_day: false };
}

type Pending = { kind: 'save'; data: Partial<CalendarEvent> } | { kind: 'delete' };

export function EventForm({ event, occurrence, defaultDay, onSave, onDelete, onClose, readOnly = false }: Props) {
  const isSeries = Boolean(event && event.recurrence !== 'none' && occurrence);
  // Bei Serien das angeklickte Vorkommen zeigen, nicht den ersten Termin der Serie
  const initial = event
    ? {
        all_day: event.all_day,
        start: occurrence ? toDateTimeKey(occurrence.start) : event.start,
        end: occurrence ? toDateTimeKey(occurrence.end) : event.end,
      }
    : defaults(defaultDay);
  const [title, setTitle] = useState(event?.title ?? '');
  const [allDay, setAllDay] = useState(initial.all_day);
  const [startDate, setStartDate] = useState(initial.start.slice(0, 10));
  const [startTime, setStartTime] = useState(initial.start.slice(11));
  const [endDate, setEndDate] = useState(initial.end.slice(0, 10));
  const [endTime, setEndTime] = useState(initial.end.slice(11));
  const [recurrence, setRecurrence] = useState<Recurrence>(event?.recurrence ?? 'none');
  const [reminder, setReminder] = useState<number | null>(event ? event.reminder_minutes : null);
  const [memberIds, setMemberIds] = useState<number[]>(event?.member_ids ?? []);
  const [location, setLocation] = useState(event?.location ?? '');
  const [description, setDescription] = useState(event?.description ?? '');
  const [pending, setPending] = useState<Pending | null>(null);
  const { busy, error, run } = useAsync();

  const formData = (): Partial<CalendarEvent> => ({
    title,
    all_day: allDay,
    start: `${startDate}T${allDay ? '00:00' : startTime}`,
    end: `${endDate}T${allDay ? '23:59' : endTime}`,
    recurrence,
    reminder_minutes: reminder,
    member_ids: memberIds,
    location,
    description,
  });

  const finish = (action: Pending, scope: Scope) =>
    void run(async () => {
      if (action.kind === 'save') await onSave(action.data, scope);
      else await onDelete!(scope);
      onClose();
    });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const data = formData();
    if (isSeries) setPending({ kind: 'save', data });
    else finish({ kind: 'save', data }, 'all');
  };

  const changeStartDate = (value: string) => {
    if (endDate < value || endDate === startDate) setEndDate(value);
    setStartDate(value);
  };

  if (pending) {
    const deleting = pending.kind === 'delete';
    return (
      <Modal title={deleting ? 'Wiederkehrenden Termin löschen' : 'Wiederkehrenden Termin ändern'} onClose={onClose}>
        <div className="scope-choice">
          <button className="button" disabled={busy} onClick={() => finish(pending, 'one')}>Nur dieser Termin</button>
          {deleting && (
            <button className="button" disabled={busy} onClick={() => finish(pending, 'following')}>Dieser und alle folgenden</button>
          )}
          <button className={`button ${deleting ? 'danger' : ''}`} disabled={busy} onClick={() => finish(pending, 'all')}>
            Alle Termine der Serie
          </button>
          {error && <p className="error">{error}</p>}
          <button className="link-button" onClick={() => setPending(null)}>Zurück</button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title={readOnly ? 'Termin' : event ? 'Termin bearbeiten' : 'Neuer Termin'} onClose={onClose}>
      <form onSubmit={submit} className="form">
        <fieldset className="plain-fieldset" disabled={readOnly}>
        <label>
          Titel
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="z. B. Fußballtraining" required autoFocus />
        </label>
        <label className="checkbox">
          <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />
          Ganztägig
        </label>
        <div className="row">
          <label>
            Beginn
            <input type="date" value={startDate} onChange={(e) => changeStartDate(e.target.value)} required />
          </label>
          {!allDay && (
            <label>
              Uhrzeit
              <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} required />
            </label>
          )}
        </div>
        <div className="row">
          <label>
            Ende
            <input type="date" value={endDate} min={startDate} onChange={(e) => setEndDate(e.target.value)} required />
          </label>
          {!allDay && (
            <label>
              Uhrzeit
              <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} required />
            </label>
          )}
        </div>
        <div className="row">
          <label>
            Wiederholung
            <select value={recurrence} onChange={(e) => setRecurrence(e.target.value as Recurrence)}>
              {Object.entries(RECURRENCE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
          <label>
            Erinnerung
            <select
              value={reminder ?? ''}
              onChange={(e) => setReminder(e.target.value === '' ? null : Number(e.target.value))}
            >
              {REMINDER_LABELS.map(([value, label]) => (
                <option key={label} value={value ?? ''}>{label}</option>
              ))}
            </select>
          </label>
        </div>
        {reminder !== null && (
          <small className="hint">
            Erinnert alle Beteiligten auf dem Handy{allDay ? ' (bei ganztägigen Terminen ausgehend von 9:00 Uhr)' : ''}.
          </small>
        )}
        <div className="field">
          <span>Wer ist dabei?</span>
          <MemberPicker value={memberIds} onChange={setMemberIds} />
        </div>
        <label>
          Ort
          <input value={location} onChange={(e) => setLocation(e.target.value)} />
        </label>
        <label>
          Notizen
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
        </label>
        </fieldset>
        {readOnly && <p className="hint">Diesen Termin können nur die Person, die ihn eingetragen hat, und die Eltern ändern.</p>}
        {error && <p className="error">{error}</p>}
        <div className="form-actions">
          {onDelete && !readOnly && (
            <button
              type="button"
              className="button danger"
              disabled={busy}
              onClick={() => {
                if (isSeries) setPending({ kind: 'delete' });
                else if (confirm('Termin löschen?')) finish({ kind: 'delete' }, 'all');
              }}
            >
              Löschen
            </button>
          )}
          <span className="spacer" />
          <button type="button" className="button" onClick={onClose}>{readOnly ? 'Schließen' : 'Abbrechen'}</button>
          {!readOnly && <button className="button primary" disabled={busy}>Speichern</button>}
        </div>
      </form>
      {event && <EventComments eventId={event.id} date={(occurrence ? toDateTimeKey(occurrence.start) : event.start).slice(0, 10)} />}
    </Modal>
  );
}

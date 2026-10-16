import { useState, type FormEvent } from 'react';
import { MemberPicker } from '../components/MemberPicker';
import { Modal } from '../components/Modal';
import { useAsync } from '../components/useAsync';
import { RECURRENCE_LABELS, toDateTimeKey } from '../dates';
import type { CalendarEvent, Recurrence } from '../types';

interface Props {
  event?: CalendarEvent;
  defaultDay: Date;
  onSave(data: Partial<CalendarEvent>): Promise<unknown>;
  onDelete?(): Promise<unknown>;
  onClose(): void;
}

function defaults(day: Date) {
  const now = new Date();
  const start = new Date(day.getFullYear(), day.getMonth(), day.getDate(), Math.min(now.getHours() + 1, 23), 0);
  return { start: toDateTimeKey(start), end: toDateTimeKey(new Date(start.getTime() + 3_600_000)) };
}

export function EventForm({ event, defaultDay, onSave, onDelete, onClose }: Props) {
  const initial = event ?? { ...defaults(defaultDay), all_day: false };
  const [title, setTitle] = useState(event?.title ?? '');
  const [allDay, setAllDay] = useState(initial.all_day);
  const [startDate, setStartDate] = useState(initial.start.slice(0, 10));
  const [startTime, setStartTime] = useState(initial.start.slice(11));
  const [endDate, setEndDate] = useState(initial.end.slice(0, 10));
  const [endTime, setEndTime] = useState(initial.end.slice(11));
  const [recurrence, setRecurrence] = useState<Recurrence>(event?.recurrence ?? 'none');
  const [memberIds, setMemberIds] = useState<number[]>(event?.member_ids ?? []);
  const [location, setLocation] = useState(event?.location ?? '');
  const [description, setDescription] = useState(event?.description ?? '');
  const { busy, error, run } = useAsync();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      await onSave({
        title,
        all_day: allDay,
        start: `${startDate}T${allDay ? '00:00' : startTime}`,
        end: `${endDate}T${allDay ? '23:59' : endTime}`,
        recurrence,
        member_ids: memberIds,
        location,
        description,
      });
      onClose();
    });
  };

  // Beim Verschieben des Beginns das Ende mitziehen
  const changeStartDate = (value: string) => {
    if (endDate < value || endDate === startDate) setEndDate(value);
    setStartDate(value);
  };

  return (
    <Modal title={event ? 'Termin bearbeiten' : 'Neuer Termin'} onClose={onClose}>
      <form onSubmit={submit} className="form">
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
        <label>
          Wiederholung
          <select value={recurrence} onChange={(e) => setRecurrence(e.target.value as Recurrence)}>
            {Object.entries(RECURRENCE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>
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
        {error && <p className="error">{error}</p>}
        <div className="form-actions">
          {onDelete && (
            <button
              type="button"
              className="button danger"
              disabled={busy}
              onClick={() => {
                if (confirm(event?.recurrence !== 'none' ? 'Alle Wiederholungen dieses Termins löschen?' : 'Termin löschen?'))
                  void run(async () => {
                    await onDelete();
                    onClose();
                  });
              }}
            >
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

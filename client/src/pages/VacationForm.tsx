import { useState, type FormEvent } from 'react';
import { MemberPicker } from '../components/MemberPicker';
import { Modal } from '../components/Modal';
import { useAsync } from '../components/useAsync';
import { toDateKey } from '../dates';
import { useFamily } from '../session';
import type { Vacation } from '../types';
import { VACATION_COLORS } from '../vacations';

interface Props {
  vacation?: Vacation;
  defaultDay: Date;
  onSave(data: Partial<Vacation>): Promise<unknown>;
  onDelete?(): Promise<unknown>;
  onClose(): void;
  /** nur ansehen (Kinder bei Urlauben anderer) */
  readOnly?: boolean;
}

export function VacationForm({ vacation, defaultDay, onSave, onDelete, onClose, readOnly = false }: Props) {
  const { member } = useFamily();
  const [title, setTitle] = useState(vacation?.title ?? 'Urlaub');
  const [start, setStart] = useState(vacation?.start_date ?? toDateKey(defaultDay));
  const [end, setEnd] = useState(vacation?.end_date ?? toDateKey(defaultDay));
  const [memberIds, setMemberIds] = useState<number[]>(vacation?.member_ids ?? []);
  const [color, setColor] = useState(vacation?.color ?? '');
  const [notes, setNotes] = useState(vacation?.notes ?? '');
  const { busy, error, run } = useAsync();
  // ohne eigene Farbe gilt die der ersten Person
  const autoColor = member(memberIds[0])?.color ?? VACATION_COLORS[0];

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      await onSave({ title, start_date: start, end_date: end, member_ids: memberIds, color, notes });
      onClose();
    });
  };

  return (
    <Modal title={readOnly ? 'Urlaub' : vacation ? 'Urlaub bearbeiten' : 'Urlaub eintragen'} onClose={onClose}>
      <form onSubmit={submit} className="form">
        <fieldset className="plain-fieldset" disabled={readOnly}>
          <label>
            Titel
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="z. B. Ostsee" required autoFocus />
          </label>
          <div className="row">
            <label>
              Von
              <input type="date" value={start} onChange={(e) => {
                if (end < e.target.value) setEnd(e.target.value);
                setStart(e.target.value);
              }} required />
            </label>
            <label>
              Bis
              <input type="date" value={end} min={start} onChange={(e) => setEnd(e.target.value)} required />
            </label>
          </div>
          <div className="field">
            <span>Wer fährt?</span>
            <MemberPicker value={memberIds} onChange={setMemberIds} />
          </div>
          <div className="field">
            <span>Farbe im Kalender</span>
            <div className="color-picker">
              <button
                type="button"
                className={`swatch swatch-auto ${color === '' ? 'active' : ''}`}
                style={{ background: autoColor }}
                aria-label="Farbe der Person"
                aria-pressed={color === ''}
                title="Farbe der Person"
                onClick={() => setColor('')}
              >A</button>
              {VACATION_COLORS.map((c) => (
                <button
                  type="button"
                  key={c}
                  className={`swatch ${color === c ? 'active' : ''}`}
                  style={{ background: c }}
                  aria-label={`Farbe ${c}`}
                  aria-pressed={color === c}
                  onClick={() => setColor(c)}
                />
              ))}
            </div>
          </div>
          <label>
            Notizen
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </label>
        </fieldset>
        {readOnly && <p className="hint">Diesen Urlaub können nur die Person, die ihn eingetragen hat, und die Eltern ändern.</p>}
        {error && <p className="error">{error}</p>}
        <div className="form-actions">
          {onDelete && !readOnly && (
            <button
              type="button"
              className="button danger"
              disabled={busy}
              onClick={() => confirm('Urlaub löschen?') && void run(async () => { await onDelete(); onClose(); })}
            >
              Löschen
            </button>
          )}
          <span className="spacer" />
          <button type="button" className="button" onClick={onClose}>{readOnly ? 'Schließen' : 'Abbrechen'}</button>
          {!readOnly && <button className="button primary" disabled={busy}>Speichern</button>}
        </div>
      </form>
    </Modal>
  );
}

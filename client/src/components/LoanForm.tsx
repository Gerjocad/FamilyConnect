import { useState, type FormEvent } from 'react';
import { addDays, toDateKey, parseLocal } from '../dates';
import { DEFAULT_WEEKS, REMIND_OPTIONS, lastRemindDays, rememberRemindDays, remindLabel } from '../loans';
import { usePermissions } from '../permissions';
import { useFamily } from '../session';
import type { Loan } from '../types';
import { MemberPicker } from './MemberPicker';
import { Modal } from './Modal';
import { useAsync } from './useAsync';

interface Props {
  loan?: Loan;
  /** bisher benutzte Orte als Vorschläge */
  lenders: string[];
  onSave(data: Partial<Loan>): Promise<unknown>;
  onDelete?(): Promise<unknown>;
  onClose(): void;
}

/** Ausleihe eintragen oder bearbeiten */
export function LoanForm({ loan, lenders, onSave, onDelete, onClose }: Props) {
  const { user } = useFamily();
  const { isChild } = usePermissions();
  const today = new Date();
  const [title, setTitle] = useState(loan?.title ?? '');
  const [author, setAuthor] = useState(loan?.author ?? '');
  const [memberId, setMemberId] = useState<number | null>(loan ? loan.member_id : user.id);
  const [lender, setLender] = useState(loan?.lender ?? lenders[0] ?? '');
  const [borrowedOn, setBorrowedOn] = useState(loan?.borrowed_on ?? toDateKey(today));
  const [due, setDue] = useState(loan?.due_date ?? toDateKey(addDays(today, DEFAULT_WEEKS * 7)));
  const [notes, setNotes] = useState(loan?.notes ?? '');
  const [returned, setReturned] = useState(loan?.returned ?? false);
  const [remind, setRemind] = useState(loan ? (loan.remind_days ?? 1) : lastRemindDays());
  const { busy, error, run } = useAsync();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      await onSave({ title, author, member_id: memberId, lender, borrowed_on: borrowedOn || null, due_date: due, notes, returned, remind_days: remind });
      rememberRemindDays(remind);
      onClose();
    });
  };

  return (
    <Modal title={loan ? 'Ausleihe bearbeiten' : 'Ausgeliehen'} onClose={onClose}>
      <form onSubmit={submit} className="form">
        <label>
          Was?
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="z. B. Gregs Tagebuch 5" maxLength={200} required autoFocus />
        </label>
        <label>
          Autor <span className="hint">(optional)</span>
          <input value={author} onChange={(e) => setAuthor(e.target.value)} maxLength={200} />
        </label>
        {!isChild && (
          <div className="field">
            <span>Wer hat es ausgeliehen?</span>
            <MemberPicker single value={memberId ? [memberId] : []} onChange={(ids) => setMemberId(ids[0] ?? null)} />
          </div>
        )}
        <label>
          Woher?
          <input value={lender} onChange={(e) => setLender(e.target.value)} placeholder="z. B. Stadtbücherei" maxLength={100} list="loan-lenders" />
          <datalist id="loan-lenders">{lenders.map((l) => <option key={l} value={l} />)}</datalist>
        </label>
        <div className="row">
          <label>
            Ausgeliehen am
            <input type="date" value={borrowedOn} onChange={(e) => {
              setBorrowedOn(e.target.value);
              // Rückgabe mitziehen, solange sie noch der Standardfrist entspricht
              if (!loan && e.target.value && due === toDateKey(addDays(parseLocal(borrowedOn || toDateKey(today)), DEFAULT_WEEKS * 7))) {
                setDue(toDateKey(addDays(parseLocal(e.target.value), DEFAULT_WEEKS * 7)));
              }
            }} />
          </label>
          <label>
            Rückgabe bis
            <input type="date" value={due} min={borrowedOn || undefined} onChange={(e) => setDue(e.target.value)} required />
          </label>
        </div>
        <div className="field">
          <span>🔔 Erinnern</span>
          <div className="remind-chips" role="group" aria-label="Erinnern">
            {REMIND_OPTIONS.map((d) => (
              <button type="button" key={d} className={`chip ${remind === d ? 'chip-active' : ''}`} aria-pressed={remind === d} onClick={() => setRemind(d)}>
                {remindLabel(d)}
              </button>
            ))}
          </div>
          <small className="hint">
            {remind === 0 ? 'Erinnerung am Rückgabetag um 7 Uhr.' : `Erinnerung ${remindLabel(remind).replace(' vorher', '')} vorher um 17 Uhr und am Rückgabetag um 7 Uhr.`}
          </small>
        </div>
        <label>
          Notizen
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} maxLength={1000} placeholder="z. B. Ausweis-Nr., Mahngebühr …" />
        </label>
        {loan && (
          <label className="checkbox">
            <input type="checkbox" checked={returned} onChange={(e) => setReturned(e.target.checked)} />
            Zurückgegeben
          </label>
        )}
        {error && <p className="error">{error}</p>}
        <div className="form-actions">
          {onDelete && (
            <button type="button" className="button danger" disabled={busy} onClick={() => confirm('Ausleihe löschen?') && void run(async () => { await onDelete(); onClose(); })}>
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

import { useMemo, useState } from 'react';
import { Avatar } from '../components/Avatar';
import { EmptyState } from '../components/EmptyState';
import { Icon } from '../components/Icon';
import { LoanForm } from '../components/LoanForm';
import { useAsync } from '../components/useAsync';
import { addDays, formatShortDay, parseLocal, toDateKey } from '../dates';
import { DEFAULT_WEEKS, daysUntil, dueLabel } from '../loans';
import { usePermissions } from '../permissions';
import { useFamily } from '../session';
import type { Loan } from '../types';
import { useResource } from '../useResource';

/** bisher benutzte „Woher“-Angaben, häufigste zuerst */
export function useLenders(loans: Loan[]) {
  return useMemo(() => {
    const counts = new Map<string, number>();
    for (const l of loans) if (l.lender) counts.set(l.lender, (counts.get(l.lender) ?? 0) + 1);
    return [...counts].sort((a, b) => b[1] - a[1]).map(([name]) => name);
  }, [loans]);
}

function LoanCard({ loan, onEdit, onUpdate }: { loan: Loan; onEdit(): void; onUpdate(data: Partial<Loan>): Promise<unknown> }) {
  const { member, user } = useFamily();
  const { isChild } = usePermissions();
  const { busy, error, run } = useAsync();
  const who = loan.member_id ? member(loan.member_id) : undefined;
  const days = daysUntil(loan);
  const urgency = loan.returned ? '' : days < 0 ? 'overdue' : days <= 1 ? 'today' : days <= 3 ? 'soon' : '';
  const canChange = !isChild || loan.created_by === user.id || loan.member_id === user.id;
  const extended = toDateKey(addDays(parseLocal(loan.due_date), DEFAULT_WEEKS * 7));

  return (
    <li className={`card loan ${urgency} ${loan.returned ? 'returned' : ''}`}>
      <span className="loan-icon" aria-hidden>📚</span>
      <div className="loan-main">
        <strong className="loan-title">{loan.title}</strong>
        <small className="muted">
          {[loan.author, loan.lender].filter(Boolean).join(' · ')}
        </small>
        <span className="loan-due">
          {loan.returned ? (
            <span className="muted">✓ zurückgegeben</span>
          ) : (
            <>
              <span className={`badge loan-badge ${urgency}`}>{dueLabel(days)}</span>
              <small className="muted"> bis {formatShortDay(parseLocal(loan.due_date))}</small>
            </>
          )}
        </span>
        {loan.notes && <small className="muted loan-notes">{loan.notes}</small>}
        {error && <p className="error">{error}</p>}
      </div>
      <div className="loan-side">
        {who && <Avatar member={who} size={28} />}
        {canChange && (
          <button className="icon-button subtle" aria-label={`${loan.title} bearbeiten`} onClick={onEdit}><Icon name="edit" size={18} /></button>
        )}
      </div>
      {canChange && !loan.returned && (
        <div className="loan-actions">
          <button className="button small" disabled={busy}
            onClick={() => confirm(`Verlängern bis ${formatShortDay(parseLocal(extended))}?`) && void run(() => onUpdate({ due_date: extended }))}>
            <Icon name="repeat" size={16} /> Verlängert
          </button>
          <button className="button small primary" disabled={busy} onClick={() => void run(() => onUpdate({ returned: true }))}>
            <Icon name="check" size={16} /> Zurückgegeben
          </button>
        </div>
      )}
    </li>
  );
}

export function LoansPage() {
  const loans = useResource<Loan>('loans');
  const { family } = useFamily();
  const lenders = useLenders(loans.items);
  const [editing, setEditing] = useState<Loan | 'new' | null>(null);
  const [filter, setFilter] = useState<number | null>(null);
  const [showReturned, setShowReturned] = useState(false);

  const mine = loans.items.filter((l) => filter === null || l.member_id === filter);
  const open = mine.filter((l) => !l.returned).sort((a, b) => a.due_date.localeCompare(b.due_date));
  const returned = mine.filter((l) => l.returned).sort((a, b) => b.due_date.localeCompare(a.due_date));
  const people = family.members.filter((m) => loans.items.some((l) => l.member_id === m.id));

  return (
    <div className="page">
      <header className="page-header">
        <h1>Ausgeliehen</h1>
        <button className="button primary" onClick={() => setEditing('new')}><Icon name="plus" /> Ausleihe</button>
      </header>

      {people.length > 1 && (
        <div className="filter-bar" role="group" aria-label="Nach Person filtern">
          <button className={`chip ${filter === null ? 'chip-active' : ''}`} onClick={() => setFilter(null)}>Alle</button>
          {people.map((m) => (
            <button key={m.id} className={`chip ${filter === m.id ? 'chip-active' : ''}`} onClick={() => setFilter(filter === m.id ? null : m.id)}>
              <span className="dot" style={{ background: m.color }} /> {m.name}
            </button>
          ))}
        </div>
      )}

      {!loans.loading && open.length === 0 ? (
        <EmptyState icon="book" title="Nichts ausgeliehen">
          <p className="muted">Trag Bücher aus der Bücherei ein – das Rückgabedatum erscheint im Kalender, und am Vortag kommt eine Erinnerung.</p>
        </EmptyState>
      ) : (
        <ul className="loan-list">
          {open.map((l) => (
            <LoanCard key={l.id} loan={l} onEdit={() => setEditing(l)} onUpdate={(data) => loans.update(l.id, data)} />
          ))}
        </ul>
      )}

      {returned.length > 0 && (
        <section className="loan-returned">
          <button className="link-button" onClick={() => setShowReturned(!showReturned)}>
            {showReturned ? '▾' : '▸'} Zurückgegeben ({returned.length})
          </button>
          {showReturned && (
            <ul className="loan-list">
              {returned.map((l) => (
                <LoanCard key={l.id} loan={l} onEdit={() => setEditing(l)} onUpdate={(data) => loans.update(l.id, data)} />
              ))}
            </ul>
          )}
        </section>
      )}

      {editing && (
        <LoanForm
          loan={editing === 'new' ? undefined : editing}
          lenders={lenders}
          onSave={(data) => (editing === 'new' ? loans.create(data) : loans.update(editing.id, data))}
          onDelete={editing === 'new' ? undefined : () => loans.remove(editing.id)}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

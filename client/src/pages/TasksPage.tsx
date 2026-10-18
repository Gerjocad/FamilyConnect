import { useState, type FormEvent } from 'react';
import { Avatar } from '../components/Avatar';
import { EmptyState } from '../components/EmptyState';
import { Icon } from '../components/Icon';
import { MemberPicker } from '../components/MemberPicker';
import { Modal } from '../components/Modal';
import { useAsync } from '../components/useAsync';
import { RECURRENCE_LABELS, formatRelativeDay, formatShortDay, parseLocal, toDateKey } from '../dates';
import { useFamily } from '../session';
import type { Recurrence, Task } from '../types';
import { useResource } from '../useResource';

function TaskForm({ task, onSave, onDelete, onClose }: {
  task?: Task;
  onSave(data: Partial<Task>): Promise<unknown>;
  onDelete?(): Promise<unknown>;
  onClose(): void;
}) {
  const [title, setTitle] = useState(task?.title ?? '');
  const [assignee, setAssignee] = useState<number[]>(task?.assignee_id ? [task.assignee_id] : []);
  const [dueDate, setDueDate] = useState(task?.due_date ?? '');
  const [notes, setNotes] = useState(task?.notes ?? '');
  const [recurrence, setRecurrence] = useState<Recurrence>(task?.recurrence ?? 'none');
  const { busy, error, run } = useAsync();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      await onSave({ title, assignee_id: assignee[0] ?? null, due_date: dueDate || null, notes, recurrence });
      onClose();
    });
  };

  return (
    <Modal title={task ? 'Aufgabe bearbeiten' : 'Neue Aufgabe'} onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <label>
          Aufgabe
          <input value={title} onChange={(e) => setTitle(e.target.value)} required autoFocus />
        </label>
        <div className="field">
          <span>Zuständig</span>
          <MemberPicker value={assignee} onChange={setAssignee} single />
        </div>
        <div className="row">
          <label>
            Fällig am
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </label>
          <label>
            Wiederholen
            <select value={recurrence} onChange={(e) => setRecurrence(e.target.value as Recurrence)}>
              {Object.entries(RECURRENCE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{value === 'none' ? 'Nicht wiederholen' : label}</option>
              ))}
            </select>
          </label>
        </div>
        {recurrence !== 'none' && (
          <small className="hint">Beim Abhaken springt die Aufgabe automatisch zum nächsten Termin.</small>
        )}
        <label>
          Notizen
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
        </label>
        {error && <p className="error">{error}</p>}
        <div className="form-actions">
          {onDelete && (
            <button
              type="button"
              className="button danger"
              onClick={() => confirm('Aufgabe löschen?') && void run(async () => {
                await onDelete();
                onClose();
              })}
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

export function TaskRow({ task, onToggle, onOpen }: { task: Task; onToggle(): void; onOpen?(): void }) {
  const { member } = useFamily();
  const assignee = member(task.assignee_id);
  const overdue = !task.done && task.due_date !== null && task.due_date < toDateKey(new Date());
  return (
    <li className={`check-row ${task.done ? 'done' : ''}`}>
      <input type="checkbox" checked={task.done} onChange={onToggle} aria-label={`${task.title} erledigt`} />
      <button type="button" className="task-main" onClick={onOpen}>
        <span className="check-text">{task.title}</span>
        {(task.due_date || task.recurrence !== 'none') && (
          <small className={overdue ? 'overdue' : 'muted'}>
            {task.recurrence !== 'none' && <Icon name="repeat" size={12} />}{' '}
            {task.due_date ? formatRelativeDay(task.due_date) : RECURRENCE_LABELS[task.recurrence]}
          </small>
        )}
      </button>
      {assignee && <Avatar member={assignee} size={26} />}
    </li>
  );
}

/** Abhaken mit Hinweis, wenn eine wiederkehrende Aufgabe zum nächsten Termin springt */
export function useTaskToggle(tasks: ReturnType<typeof useResource<Task>>) {
  const [message, setMessage] = useState<string | null>(null);
  const toggle = async (task: Task) => {
    const updated = await tasks.update(task.id, { done: !task.done });
    if (!task.done && task.recurrence !== 'none' && updated.due_date) {
      setMessage(`„${task.title}“ erledigt – nächstes Mal ${formatShortDay(parseLocal(updated.due_date))}`);
      window.setTimeout(() => setMessage(null), 4000);
    }
  };
  const toast = message && <div className="toast" role="status">{message}</div>;
  return { toggle, toast };
}

type Filter = 'open' | 'mine' | 'done';

export function TasksPage() {
  const { user } = useFamily();
  const tasks = useResource<Task>('tasks');
  const [filter, setFilter] = useState<Filter>('open');
  const [title, setTitle] = useState('');
  // Zuständige Person für die Schnelleingabe (in „Meine“ automatisch man selbst)
  const [assignee, setAssignee] = useState<number[]>([]);
  const [editing, setEditing] = useState<Task | 'new' | null>(null);
  const { error, run } = useAsync();
  const { toggle, toast } = useTaskToggle(tasks);

  const shown = tasks.items.filter((t) =>
    filter === 'done' ? t.done : !t.done && (filter === 'open' || t.assignee_id === user.id)
  );

  const quickAdd = (e: FormEvent) => {
    e.preventDefault();
    const text = title;
    if (!text.trim()) return;
    // Sofort leeren, damit man direkt die nächste Aufgabe tippen kann
    setTitle('');
    void run(async () => {
      try {
        await tasks.create({ title: text, assignee_id: assignee[0] ?? (filter === 'mine' ? user.id : null) });
      } catch (err) {
        setTitle((current) => current || text);
        throw err;
      }
    });
  };

  const labels: Record<Filter, string> = { open: 'Offen', mine: 'Meine', done: 'Erledigt' };

  return (
    <div className="page">
      <header className="page-header">
        <h1>Aufgaben</h1>
        <button className="button primary" onClick={() => setEditing('new')}><Icon name="plus" /> Aufgabe</button>
      </header>

      <div className="segmented" role="tablist">
        {(Object.keys(labels) as Filter[]).map((f) => (
          <button key={f} role="tab" aria-selected={filter === f} className={filter === f ? 'active' : ''} onClick={() => setFilter(f)}>
            {labels[f]}
          </button>
        ))}
      </div>

      <section className="card">
        {filter !== 'done' && (
          <form onSubmit={quickAdd} className="quick-add-block">
            <div className="quick-add">
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Neue Aufgabe …" aria-label="Neue Aufgabe" />
              <button className="button primary" aria-label="Hinzufügen"><Icon name="plus" /></button>
            </div>
            <div className="assign-row">
              <span className="muted">Wer erledigt es?</span>
              <MemberPicker value={assignee} onChange={setAssignee} single />
            </div>
          </form>
        )}
        {error && <p className="error">{error}</p>}
        {!tasks.loading && shown.length === 0 ? (
          <EmptyState icon="task" title={filter === 'done' ? 'Noch nichts erledigt' : 'Alles erledigt!'} />
        ) : (
          <ul className="check-list">
            {shown.map((t) => (
              <TaskRow key={t.id} task={t} onToggle={() => void toggle(t)} onOpen={() => setEditing(t)} />
            ))}
          </ul>
        )}
      </section>

      {toast}
      {editing && (
        <TaskForm
          task={editing === 'new' ? undefined : editing}
          onClose={() => setEditing(null)}
          onSave={(data) => (editing === 'new' ? tasks.create(data) : tasks.update(editing.id, data))}
          onDelete={editing === 'new' ? undefined : () => tasks.remove(editing.id)}
        />
      )}
    </div>
  );
}

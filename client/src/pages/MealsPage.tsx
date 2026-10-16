import { useState, type FormEvent } from 'react';
import { api } from '../api';
import { Icon } from '../components/Icon';
import { Modal } from '../components/Modal';
import { useAsync } from '../components/useAsync';
import { addDays, formatShortDay, sameDay, startOfWeek, toDateKey } from '../dates';
import { useFamily } from '../session';
import type { List, Meal, MealSlot } from '../types';
import { useResource } from '../useResource';

const SLOTS: { slot: MealSlot; label: string }[] = [
  { slot: 'breakfast', label: 'Frühstück' },
  { slot: 'lunch', label: 'Mittag' },
  { slot: 'dinner', label: 'Abend' },
];

function MealForm({ meal, date, slot, onSave, onDelete, onClose }: {
  meal?: Meal;
  date: string;
  slot: MealSlot;
  onSave(data: Partial<Meal>): Promise<unknown>;
  onDelete?(): Promise<unknown>;
  onClose(): void;
}) {
  const { family } = useFamily();
  const lists = useResource<List>('lists');
  const [title, setTitle] = useState(meal?.title ?? '');
  const [notes, setNotes] = useState(meal?.notes ?? '');
  const [targetList, setTargetList] = useState<number | ''>('');
  const [added, setAdded] = useState<string | null>(null);
  const { busy, error, run } = useAsync();
  const shoppingLists = lists.items.filter((l) => l.kind === 'shopping');
  const ingredients = notes.split('\n').map((l) => l.trim()).filter(Boolean);
  const listId = targetList || shoppingLists[0]?.id;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      await onSave({ date, slot, title, notes });
      onClose();
    });
  };

  const addToList = () =>
    void run(async () => {
      for (const text of ingredients) {
        await api(`/families/${family.id}/items`, { method: 'POST', body: { list_id: listId, text } });
      }
      setAdded(`${ingredients.length} Zutat${ingredients.length === 1 ? '' : 'en'} hinzugefügt`);
    });

  const label = SLOTS.find((s) => s.slot === slot)!.label;

  return (
    <Modal title={`${label} · ${formatShortDay(new Date(`${date}T00:00`))}`} onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <label>
          Gericht
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="z. B. Spaghetti Bolognese" required autoFocus />
        </label>
        <label>
          Zutaten (eine pro Zeile)
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={5} placeholder={'500 g Hackfleisch\nTomaten\nSpaghetti'} />
        </label>
        {ingredients.length > 0 && shoppingLists.length > 0 && (
          <div className="row align-end">
            <label>
              Einkaufsliste
              <select value={listId} onChange={(e) => setTargetList(Number(e.target.value))}>
                {shoppingLists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </label>
            <button type="button" className="button" onClick={addToList} disabled={busy}>
              <Icon name="list" size={18} /> Zutaten übernehmen
            </button>
          </div>
        )}
        {added && <p className="success">{added}</p>}
        {error && <p className="error">{error}</p>}
        <div className="form-actions">
          {onDelete && (
            <button type="button" className="button danger" onClick={() => void run(async () => {
              await onDelete();
              onClose();
            })}>
              Entfernen
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

export function MealsPage() {
  const meals = useResource<Meal>('meals');
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [editing, setEditing] = useState<{ date: string; slot: MealSlot; meal?: Meal } | null>(null);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const today = new Date();

  const find = (date: string, slot: MealSlot) => meals.items.find((m) => m.date === date && m.slot === slot);

  return (
    <div className="page">
      <header className="page-header">
        <h1>Essensplan</h1>
        <div className="week-nav">
          <button className="icon-button" onClick={() => setWeekStart(addDays(weekStart, -7))} aria-label="Vorherige Woche"><Icon name="left" /></button>
          <span>{formatShortDay(days[0])} – {formatShortDay(days[6])}</span>
          <button className="icon-button" onClick={() => setWeekStart(addDays(weekStart, 7))} aria-label="Nächste Woche"><Icon name="right" /></button>
        </div>
      </header>

      <div className="meal-week">
        {days.map((day) => {
          const key = toDateKey(day);
          return (
            <section key={key} className={`card meal-day ${sameDay(day, today) ? 'today' : ''}`}>
              <h3>{formatShortDay(day)}</h3>
              {SLOTS.map(({ slot, label }) => {
                const meal = find(key, slot);
                return (
                  <button key={slot} className={`meal-slot ${meal ? 'filled' : ''}`} onClick={() => setEditing({ date: key, slot, meal })}>
                    <small>{label}</small>
                    <span>{meal?.title ?? '+'}</span>
                  </button>
                );
              })}
            </section>
          );
        })}
      </div>

      {editing && (
        <MealForm
          {...editing}
          onClose={() => setEditing(null)}
          onSave={(data) => (editing.meal ? meals.update(editing.meal.id, data) : meals.create(data))}
          onDelete={editing.meal ? () => meals.remove(editing.meal!.id) : undefined}
        />
      )}
    </div>
  );
}

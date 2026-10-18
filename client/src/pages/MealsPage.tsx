import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { api } from '../api';
import { Icon } from '../components/Icon';
import { Modal } from '../components/Modal';
import { useAsync } from '../components/useAsync';
import { addDays, formatDayMonth, formatShortDay, sameDay, startOfWeek, toDateKey } from '../dates';
import { useFamily } from '../session';
import { parseIngredients, quantityOf } from '../ingredients';
import { importRecipe, searchRecipes, type RecipeDraft, type WebRecipe } from '../recipeWeb';
import type { List, Meal, MealSlot, Recipe } from '../types';
import { useResource } from '../useResource';

export const SLOTS: { slot: MealSlot; label: string }[] = [
  { slot: 'breakfast', label: 'Frühstück' },
  { slot: 'lunch', label: 'Mittag' },
  { slot: 'dinner', label: 'Abend' },
];

function RecipePicker({ recipes, onPick }: { recipes: Recipe[]; onPick(recipe: Recipe): void }) {
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const shown = recipes.filter((r) => !q || r.title.toLowerCase().includes(q) || r.category.toLowerCase().includes(q));
  return (
    <div className="recipe-picker">
      {recipes.length > 5 && (
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rezept suchen …" aria-label="Rezept suchen" autoFocus />
      )}
      <div className="recipe-picker-list">
        {shown.map((r) => (
          <button type="button" key={r.id} className="recipe-option" onClick={() => onPick(r)}>
            <span className="recipe-thumb small">
              {r.image_url ? <img src={r.image_url} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <Icon name="recipe" size={18} />}
            </span>
            <span className="recipe-card-text">
              <strong>{r.title}</strong>
              {(r.category || r.duration) && <small className="muted">{[r.category, r.duration].filter(Boolean).join(' · ')}</small>}
            </span>
          </button>
        ))}
        {shown.length === 0 && <p className="muted">Kein Rezept gefunden.</p>}
      </div>
    </div>
  );
}

function RecipeSearch({ recipes, onPick, onImported }: {
  recipes: Recipe[];
  onPick(recipe: Recipe): void;
  /** Treffer aus dem Netz wurde übernommen und als Rezept gespeichert */
  onImported(draft: RecipeDraft): Promise<void>;
}) {
  const { family } = useFamily();
  const [query, setQuery] = useState('');
  const [searched, setSearched] = useState('');
  const [results, setResults] = useState<WebRecipe[] | null>(null);
  const [importing, setImporting] = useState<string | null>(null);
  const { busy, error, run } = useAsync();
  const q = searched.toLowerCase();
  const own = q ? recipes.filter((r) => r.title.toLowerCase().includes(q) || r.ingredients.toLowerCase().includes(q)) : [];

  const search = () => {
    const text = query.trim();
    if (!text) return;
    setSearched(text);
    setResults(null);
    void run(async () => setResults(await searchRecipes(family.id, text)));
  };

  const take = (hit: WebRecipe) => {
    setImporting(hit.url);
    void run(async () => {
      try {
        await onImported(await importRecipe(family.id, hit.url));
      } finally {
        setImporting(null);
      }
    });
  };

  return (
    <div className="recipe-picker">
      <div className="quick-add">
        <input
          type="search"
          enterKeyHint="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          // Enter sucht, statt den Essensplan-Eintrag zu speichern
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              search();
            }
          }}
          placeholder="Gericht, z. B. Lasagne"
          aria-label="Gericht suchen"
          autoFocus
        />
        <button type="button" className="button primary" onClick={search} disabled={busy} aria-label="Suchen"><Icon name="search" size={18} /></button>
      </div>
      {busy && !importing && <p className="muted">Suche in Rezeptportalen … das dauert ein paar Sekunden.</p>}
      {importing && <p className="muted">Rezept wird übernommen …</p>}
      {error && <p className="error">{error}</p>}
      <div className="recipe-picker-list">
        {own.length > 0 && <small className="picker-group">Eigene Rezepte</small>}
        {own.map((r) => (
          <button type="button" key={r.id} className="recipe-option" onClick={() => onPick(r)}>
            <span className="recipe-thumb small">
              {r.image_url ? <img src={r.image_url} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <Icon name="recipe" size={18} />}
            </span>
            <span className="recipe-card-text"><strong>{r.title}</strong><small className="muted">gespeichert</small></span>
          </button>
        ))}
        {results && results.length > 0 && <small className="picker-group">Aus dem Netz – wird beim Auswählen in deinen Rezepten gespeichert</small>}
        {results?.map((hit) => (
          <button type="button" key={hit.url} className="recipe-option" onClick={() => take(hit)} disabled={busy}>
            <span className="recipe-thumb small">
              {hit.image_url ? <img src={hit.image_url} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <Icon name="recipe" size={18} />}
            </span>
            <span className="recipe-card-text">
              <strong>{hit.title}</strong>
              <small className="muted">{[hit.source, hit.duration].filter(Boolean).join(' · ')}</small>
            </span>
            {importing === hit.url && <span className="spinner" aria-label="Lädt" />}
          </button>
        ))}
        {results && results.length === 0 && own.length === 0 && <p className="muted">Nichts gefunden – versuch es mit einem anderen Begriff.</p>}
      </div>
    </div>
  );
}

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
  const recipes = useResource<Recipe>('recipes');
  const [title, setTitle] = useState(meal?.title ?? '');
  const [notes, setNotes] = useState(meal?.notes ?? '');
  const [recipeId, setRecipeId] = useState<number | null>(meal?.recipe_id ?? null);
  // Neuer Eintrag: erst aus den Rezepten wählen, sofern es welche gibt
  const [mode, setMode] = useState<'recipe' | 'search' | 'free'>(meal ? 'free' : 'recipe');
  const [targetList, setTargetList] = useState<number | ''>('');
  const [added, setAdded] = useState<string | null>(null);
  const { busy, error, run } = useAsync();
  const recipe = recipes.items.find((r) => r.id === recipeId);
  const shoppingLists = lists.items.filter((l) => l.kind === 'shopping');
  const listId = targetList || shoppingLists[0]?.id;
  // Ohne gespeicherte Rezepte startet ein neuer Eintrag direkt mit der Suche
  const view = mode === 'recipe' && !recipes.loading && recipes.items.length === 0 ? 'search' : mode;
  const picking = !recipe && view !== 'free';

  // Mit Rezept kommen die Zutaten (mit Menge) aus dem Rezept, sonst aus dem Notizfeld
  const ingredients = recipe
    ? parseIngredients(recipe.ingredients).filter((i) => !i.heading).map((i) => ({ text: i.name, quantity: quantityOf(i) }))
    : notes.split('\n').map((l) => l.trim()).filter(Boolean).map((text) => ({ text, quantity: '' }));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      await onSave({ date, slot, title, notes, recipe_id: recipe ? recipe.id : null });
      onClose();
    });
  };

  const pick = (r: Recipe) => {
    setRecipeId(r.id);
    setTitle(r.title);
  };

  const addToList = () =>
    void run(async () => {
      for (const item of ingredients) {
        await api(`/families/${family.id}/items`, { method: 'POST', body: { list_id: listId, text: item.text.slice(0, 200), quantity: item.quantity.slice(0, 50) } });
      }
      setAdded(`${ingredients.length} Zutat${ingredients.length === 1 ? '' : 'en'} hinzugefügt`);
    });

  const label = SLOTS.find((s) => s.slot === slot)!.label;

  return (
    <Modal title={`${label} · ${formatShortDay(new Date(`${date}T00:00`))}`} onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <div className="segmented" role="tablist">
          {recipes.items.length > 0 && (
            <button type="button" role="tab" aria-selected={view === 'recipe'} className={view === 'recipe' ? 'active' : ''} onClick={() => { setMode('recipe'); setRecipeId(null); }}>
              Rezepte
            </button>
          )}
          <button type="button" role="tab" aria-selected={view === 'search'} className={view === 'search' ? 'active' : ''} onClick={() => { setMode('search'); setRecipeId(null); }}>
            Suchen
          </button>
          <button type="button" role="tab" aria-selected={view === 'free'} className={view === 'free' ? 'active' : ''} onClick={() => { setMode('free'); setRecipeId(null); }}>
            Selbst
          </button>
        </div>

        {picking ? (
          view === 'search' ? (
            <RecipeSearch
              recipes={recipes.items}
              onPick={pick}
              onImported={async (draft) => pick(await recipes.create(draft))}
            />
          ) : (
            <RecipePicker recipes={recipes.items} onPick={pick} />
          )
        ) : recipe ? (
          <div className="meal-recipe">
            <span className="recipe-thumb small">
              {recipe.image_url ? <img src={recipe.image_url} alt="" referrerPolicy="no-referrer" /> : <Icon name="recipe" size={18} />}
            </span>
            <span className="recipe-card-text">
              <strong>{recipe.title}</strong>
              <Link className="link-button" to={`/rezepte/${recipe.id}`}>Rezept öffnen</Link>
            </span>
            <span className="spacer" />
            <button type="button" className="link-button" onClick={() => { setRecipeId(null); setMode((m) => (m === 'free' ? 'recipe' : m)); }}>Ändern</button>
          </div>
        ) : (
          <>
            <label>
              Gericht
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="z. B. Spaghetti Bolognese" required autoFocus />
            </label>
            <label>
              Zutaten (eine pro Zeile)
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={5} placeholder={'500 g Hackfleisch\nTomaten\nSpaghetti'} />
            </label>
          </>
        )}

        {!picking && ingredients.length > 0 && shoppingLists.length > 0 && (
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
          {!picking && <button className="button primary" disabled={busy}>Speichern</button>}
        </div>
      </form>
    </Modal>
  );
}

const weekdayFmt = new Intl.DateTimeFormat('de-DE', { weekday: 'short' });

export function MealsPage() {
  const meals = useResource<Meal>('meals');
  const recipes = useResource<Recipe>('recipes');
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [editing, setEditing] = useState<{ date: string; slot: MealSlot; meal?: Meal } | null>(null);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const today = new Date();
  const todayKey = toDateKey(today);
  const isCurrentWeek = sameDay(weekStart, startOfWeek(today));
  const todayRef = useRef<HTMLElement>(null);

  // Beim Öffnen zum heutigen Tag scrollen (sonst steht z. B. am Sonntag alles Wichtige ganz unten)
  useEffect(() => {
    if (isCurrentWeek && !meals.loading) todayRef.current?.scrollIntoView({ block: 'center' });
  }, [meals.loading]);

  const find = (date: string, slot: MealSlot) => meals.items.find((m) => m.date === date && m.slot === slot);
  const recipeOf = (meal?: Meal) => (meal?.recipe_id ? recipes.items.find((r) => r.id === meal.recipe_id) : undefined);

  return (
    <div className="page narrow">
      <header className="page-header">
        <h1>Essensplan</h1>
        {!isCurrentWeek && (
          <button className="button" onClick={() => setWeekStart(startOfWeek(today))}>Diese Woche</button>
        )}
      </header>
      <div className="week-nav">
        <button className="icon-button" onClick={() => setWeekStart(addDays(weekStart, -7))} aria-label="Vorherige Woche"><Icon name="left" /></button>
        <span>{formatDayMonth(days[0])} – {formatDayMonth(days[6])}</span>
        <button className="icon-button" onClick={() => setWeekStart(addDays(weekStart, 7))} aria-label="Nächste Woche"><Icon name="right" /></button>
      </div>

      <div className="meal-list">
        {days.map((day) => {
          const key = toDateKey(day);
          const isToday = key === todayKey;
          return (
            <section key={key} ref={isToday ? todayRef : undefined} className={`card meal-day ${isToday ? 'today' : ''} ${key < todayKey ? 'past' : ''}`}>
              <div className="meal-date" aria-label={formatShortDay(day)}>
                <span className="meal-weekday">{isToday ? 'Heute' : weekdayFmt.format(day).replace('.', '')}</span>
                <span className="meal-daynum">{day.getDate()}</span>
              </div>
              <div className="meal-slots">
                {SLOTS.map(({ slot, label }) => {
                  const meal = find(key, slot);
                  const recipe = recipeOf(meal);
                  return (
                    <button
                      key={slot}
                      className={`meal-slot ${meal ? 'filled' : ''}`}
                      onClick={() => setEditing({ date: key, slot, meal })}
                      aria-label={`${label}: ${meal?.title ?? 'eintragen'}`}
                    >
                      <span className="meal-slot-label">{label}</span>
                      {meal ? (
                        <span className="meal-slot-title">{meal.title}</span>
                      ) : (
                        <span className="meal-slot-empty"><Icon name="plus" size={14} /> Eintragen</span>
                      )}
                      {recipe?.image_url && <img className="meal-slot-thumb" src={recipe.image_url} alt="" loading="lazy" referrerPolicy="no-referrer" />}
                      {recipe && !recipe.image_url && <span className="meal-slot-icon"><Icon name="recipe" size={16} /></span>}
                    </button>
                  );
                })}
              </div>
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

import { useEffect, useState, type FormEvent } from 'react';
import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { Link, useNavigate, useParams } from 'react-router';
import { api, ApiError, isNativeApp } from '../api';
import { EmptyState } from '../components/EmptyState';
import { Icon } from '../components/Icon';
import { Modal } from '../components/Modal';
import { useAsync } from '../components/useAsync';
import { ingredientKey, parseIngredients, quantityOf, type Ingredient } from '../ingredients';
import { useFamily } from '../session';
import type { List, ListItem, Recipe } from '../types';
import { useResource } from '../useResource';

type Draft = Omit<Recipe, 'id' | 'created_by' | 'created_at'>;

const EMPTY: Draft = {
  title: '', category: '', servings: null, duration: '', ingredients: '', instructions: '', notes: '', source_url: '', image_url: '',
};
const CATEGORY_SUGGESTIONS = ['Hauptgericht', 'Suppe', 'Salat', 'Beilage', 'Frühstück', 'Dessert', 'Kuchen', 'Brot', 'Snack', 'Getränk'];

// --- Import -------------------------------------------------------------------

/** Manche Seiten (z. B. Chefkoch) sperren Server-Zugriffe – dann lädt das Handy die Seite selbst */
async function loadOnPhone(url: string): Promise<string | null> {
  if (!isNativeApp || !Capacitor.isPluginAvailable('CapacitorHttp')) return null;
  try {
    const res = await CapacitorHttp.get({ url, responseType: 'text', connectTimeout: 15_000, readTimeout: 15_000 });
    return res.status >= 200 && res.status < 300 && typeof res.data === 'string' ? res.data : null;
  } catch {
    return null;
  }
}

function ImportDialog({ onDraft, onClose }: { onDraft(draft: Draft): void; onClose(): void }) {
  const { family } = useFamily();
  const [mode, setMode] = useState<'link' | 'text'>('link');
  const [url, setUrl] = useState('');
  const [text, setText] = useState('');
  const [ai, setAi] = useState(false);
  const { busy, error, run } = useAsync();
  const path = `/families/${family.id}/recipes/import`;

  useEffect(() => {
    api<{ ai: boolean }>(path).then((r) => setAi(r.ai), () => {});
  }, [path]);

  const importLink = async () => {
    const link = url.trim();
    try {
      return await api<Draft>(path, { method: 'POST', body: { url: link }, timeoutMs: 90_000 });
    } catch (err) {
      // Seite hat den Server abgewiesen → übers Handy versuchen
      if (!(err instanceof ApiError) || err.status !== 502) throw err;
      const html = await loadOnPhone(link);
      if (!html) throw err;
      return api<Draft>(path, { method: 'POST', body: { url: link, html }, timeoutMs: 90_000 });
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      const draft = mode === 'link'
        ? await importLink()
        : await api<Draft>(path, { method: 'POST', body: { text }, timeoutMs: 90_000 });
      onDraft({ ...EMPTY, ...draft });
    });
  };

  return (
    <Modal title="Neues Rezept" onClose={onClose}>
      <form className="form" onSubmit={submit}>
        {ai && (
          <div className="segmented" role="tablist">
            <button type="button" role="tab" aria-selected={mode === 'link'} className={mode === 'link' ? 'active' : ''} onClick={() => setMode('link')}>Link</button>
            <button type="button" role="tab" aria-selected={mode === 'text'} className={mode === 'text' ? 'active' : ''} onClick={() => setMode('text')}>Text einfügen</button>
          </div>
        )}
        {mode === 'link' ? (
          <label>
            Link zum Rezept
            <input type="url" inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://www.chefkoch.de/rezepte/…" required autoFocus />
            <small className="hint">
              Titel, Zutaten, Zubereitung und Bild werden übernommen – du kannst vor dem Speichern noch alles ändern.
              {ai && ' Klappt das nicht direkt, liest die KI das Rezept von der Seite.'}
            </small>
          </label>
        ) : (
          <label>
            Rezepttext
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={8} placeholder="Rezept aus einer Nachricht, einem Video-Text oder einer Notiz hier einfügen …" required autoFocus />
            <small className="hint">Die KI sortiert den Text in Zutaten und Arbeitsschritte.</small>
          </label>
        )}
        {busy && <p className="muted">{mode === 'text' || ai ? 'Rezept wird ausgelesen … das kann bis zu einer halben Minute dauern.' : 'Rezept wird geladen …'}</p>}
        {error && <p className="error">{error}</p>}
        <div className="form-actions">
          <button type="button" className="link-button" onClick={() => onDraft({ ...EMPTY, source_url: mode === 'link' ? url.trim() : '' })}>
            Selbst eingeben
          </button>
          <span className="spacer" />
          <button className="button primary" disabled={busy}>
            <Icon name={mode === 'link' ? 'download' : 'sparkle'} size={18} /> Übernehmen
          </button>
        </div>
      </form>
    </Modal>
  );
}

// --- Bearbeiten -----------------------------------------------------------------

function RecipeForm({ recipe, onSave, onDelete, onClose }: {
  recipe: Draft;
  onSave(data: Draft): Promise<unknown>;
  onDelete?(): Promise<unknown>;
  onClose(): void;
}) {
  const [data, setData] = useState<Draft>(recipe);
  const { busy, error, run } = useAsync();
  const set = <K extends keyof Draft>(field: K) => (e: { target: { value: string } }) =>
    setData({ ...data, [field]: field === 'servings' ? (e.target.value ? Number(e.target.value) : null) : e.target.value });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      await onSave(data);
      onClose();
    });
  };

  return (
    <Modal title={onDelete ? 'Rezept bearbeiten' : 'Rezept speichern'} onClose={onClose}>
      <form className="form" onSubmit={submit}>
        {data.image_url && <img className="recipe-form-image" src={data.image_url} alt="" referrerPolicy="no-referrer" />}
        <label>Name<input value={data.title} onChange={set('title')} required autoFocus={!data.title} /></label>
        <div className="row">
          <label>
            Kategorie
            <input value={data.category} onChange={set('category')} list="recipe-categories" placeholder="z. B. Hauptgericht" />
            <datalist id="recipe-categories">
              {CATEGORY_SUGGESTIONS.map((c) => <option key={c} value={c} />)}
            </datalist>
          </label>
          <label>Portionen<input type="number" min={1} max={100} value={data.servings ?? ''} onChange={set('servings')} /></label>
        </div>
        <label>Dauer<input value={data.duration} onChange={set('duration')} placeholder="z. B. 45 Min." /></label>
        <label>
          Zutaten <span className="hint">(eine pro Zeile, „Für den Teig:“ als Überschrift)</span>
          <textarea value={data.ingredients} onChange={set('ingredients')} rows={8} placeholder={'500 g Spaghetti\n1 Zwiebel\n2 EL Olivenöl'} />
        </label>
        <label>
          Zubereitung <span className="hint">(ein Schritt pro Zeile)</span>
          <textarea value={data.instructions} onChange={set('instructions')} rows={8} />
        </label>
        <label>Notizen<textarea value={data.notes} onChange={set('notes')} rows={2} /></label>
        <label>Link zum Original<input type="url" value={data.source_url} onChange={set('source_url')} placeholder="https://…" /></label>
        <label>Bild-Link<input type="url" value={data.image_url} onChange={set('image_url')} placeholder="https://…" /></label>
        {error && <p className="error">{error}</p>}
        <div className="form-actions">
          {onDelete && (
            <button type="button" className="button danger" onClick={() => confirm('Rezept löschen?') && void run(async () => {
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

// --- Einkaufsliste --------------------------------------------------------------

const LIST_KEY = 'familyconnect.recipeList';

/** Ziel-Einkaufsliste für Zutaten; wird beim ersten Hinzufügen angelegt, falls es noch keine gibt */
function useShoppingList() {
  const lists = useResource<List>('lists');
  const items = useResource<ListItem>('items');
  const shopping = lists.items.filter((l) => l.kind === 'shopping');
  const [chosen, setChosen] = useState<number | null>(() => {
    try {
      return Number(localStorage.getItem(LIST_KEY)) || null;
    } catch {
      return null;
    }
  });
  const target = shopping.find((l) => l.id === chosen) ?? shopping[0] ?? null;

  const choose = (id: number) => {
    setChosen(id);
    try {
      localStorage.setItem(LIST_KEY, String(id));
    } catch {
      // nur für diese Sitzung gemerkt
    }
  };

  /** Offene Einträge der Liste, nach Zutat gruppiert */
  const onList = new Set(items.items.filter((i) => i.list_id === target?.id && !i.done).map((i) => ingredientKey(i.text)));

  const add = async (entries: { text: string; quantity: string }[]) => {
    const list = target ?? (await lists.create({ name: 'Einkaufsliste', kind: 'shopping' }));
    if (!target) choose(list.id);
    for (const entry of entries) {
      await items.create({ list_id: list.id, text: entry.text.slice(0, 200), quantity: entry.quantity.slice(0, 50) });
    }
    return list;
  };

  return { shopping, target, choose, onList, add };
}

// --- Rezept ansehen -----------------------------------------------------------------

function RecipeDetail({ recipe, onEdit }: { recipe: Recipe; onEdit(): void }) {
  const [servings, setServings] = useState(recipe.servings);
  const [doneSteps, setDoneSteps] = useState<Set<number>>(new Set());
  const [message, setMessage] = useState<string | null>(null);
  const shopping = useShoppingList();
  const { busy, error, run } = useAsync();

  useEffect(() => {
    setServings(recipe.servings);
    setDoneSteps(new Set());
  }, [recipe.id, recipe.servings]);

  const factor = recipe.servings && servings ? servings / recipe.servings : 1;
  const ingredients = parseIngredients(recipe.ingredients);
  const steps = recipe.instructions.split('\n').map((s) => s.trim()).filter(Boolean);
  const missing = ingredients.filter((i) => !i.heading && !shopping.onList.has(ingredientKey(i.name)));

  const toast = (text: string) => {
    setMessage(text);
    window.setTimeout(() => setMessage(null), 3000);
  };

  const addIngredients = (list: Ingredient[]) =>
    void run(async () => {
      const target = await shopping.add(list.map((i) => ({ text: i.name, quantity: quantityOf(i, factor) })));
      toast(list.length === 1 ? `„${list[0].name}“ steht auf „${target.name}“` : `${list.length} Zutaten auf „${target.name}“`);
    });

  let stepNumber = 0;

  return (
    <article className="recipe-detail">
      <header className="section-header">
        <Link to="/rezepte" className="icon-button only-mobile" aria-label="Zurück"><Icon name="left" /></Link>
        <h2>{recipe.title}</h2>
        <span className="spacer" />
        <button className="icon-button" onClick={onEdit} aria-label="Rezept bearbeiten"><Icon name="edit" size={18} /></button>
      </header>

      {recipe.image_url && <img className="recipe-hero" src={recipe.image_url} alt="" referrerPolicy="no-referrer" />}

      <div className="recipe-meta">
        {recipe.category && <span className="badge">{recipe.category}</span>}
        {recipe.duration && <span className="muted">⏱ {recipe.duration}</span>}
        {recipe.source_url && (
          <a className="link-button" href={recipe.source_url} target="_blank" rel="noreferrer">
            <Icon name="external" size={14} /> Original
          </a>
        )}
      </div>
      {recipe.notes && <p className="recipe-notes">{recipe.notes}</p>}

      <section className="card">
        <div className="section-header">
          <h3>Zutaten</h3>
          <span className="spacer" />
          {recipe.servings && servings && (
            <div className="stepper" role="group" aria-label="Portionen">
              <button className="icon-button" onClick={() => setServings(Math.max(1, servings - 1))} aria-label="Weniger Portionen"><Icon name="minus" size={16} /></button>
              <span>{servings} {servings === 1 ? 'Portion' : 'Portionen'}</span>
              <button className="icon-button" onClick={() => setServings(Math.min(100, servings + 1))} aria-label="Mehr Portionen"><Icon name="plus" size={16} /></button>
            </div>
          )}
        </div>
        {ingredients.length === 0 ? (
          <p className="muted">Keine Zutaten eingetragen.</p>
        ) : (
          <>
            <p className="hint">Tippe auf eine Zutat, um sie auf die Einkaufsliste zu setzen.</p>
            <ul className="ingredient-list">
              {ingredients.map((i, index) => {
                if (i.heading) return <li key={index} className="ingredient-heading">{i.name}</li>;
                const listed = shopping.onList.has(ingredientKey(i.name));
                return (
                  <li key={index}>
                    <button
                      className={`ingredient ${listed ? 'listed' : ''}`}
                      onClick={() => (listed ? toast(`„${i.name}“ steht schon auf der Liste`) : addIngredients([i]))}
                      disabled={busy}
                    >
                      <span className="ingredient-qty">{quantityOf(i, factor)}</span>
                      <span className="ingredient-name">{i.name}</span>
                      <Icon name={listed ? 'check' : 'cart'} size={18} />
                    </button>
                  </li>
                );
              })}
            </ul>
            <div className="recipe-shopping">
              {missing.length === 0 ? (
                <span className="success"><Icon name="check" size={16} /> Alles steht auf der Einkaufsliste</span>
              ) : (
                <button className="button primary" onClick={() => addIngredients(missing)} disabled={busy}>
                  <Icon name="cart" size={18} /> {missing.length === ingredients.filter((i) => !i.heading).length ? 'Alle' : `Fehlende (${missing.length})`} auf die Einkaufsliste
                </button>
              )}
              {shopping.shopping.length > 1 && (
                <select value={shopping.target?.id} onChange={(e) => shopping.choose(Number(e.target.value))} aria-label="Einkaufsliste wählen">
                  {shopping.shopping.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              )}
              {shopping.target && <Link className="link-button" to={`/listen/${shopping.target.id}`}>Zur Liste</Link>}
            </div>
          </>
        )}
        {error && <p className="error">{error}</p>}
      </section>

      {steps.length > 0 && (
        <section className="card">
          <h3>Zubereitung</h3>
          <p className="hint">Erledigte Schritte antippen, um sie abzuhaken.</p>
          <ol className="step-list">
            {steps.map((step, index) => {
              if (/:$/.test(step)) return <li key={index} className="ingredient-heading">{step.slice(0, -1)}</li>;
              stepNumber += 1;
              const done = doneSteps.has(index);
              return (
                <li key={index}>
                  <button
                    className={`step ${done ? 'done' : ''}`}
                    onClick={() => setDoneSteps((prev) => {
                      const next = new Set(prev);
                      if (done) next.delete(index);
                      else next.add(index);
                      return next;
                    })}
                  >
                    <span className="step-number">{done ? <Icon name="check" size={14} /> : stepNumber}</span>
                    <span>{step}</span>
                  </button>
                </li>
              );
            })}
          </ol>
        </section>
      )}

      {message && <div className="toast" role="status">{message}</div>}
    </article>
  );
}

// --- Übersicht ------------------------------------------------------------------

export function RecipesPage() {
  const recipes = useResource<Recipe>('recipes');
  const { recipeId } = useParams();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [editing, setEditing] = useState<{ draft: Draft; recipe?: Recipe } | null>(null);
  const selected = recipeId ? recipes.items.find((r) => r.id === Number(recipeId)) : undefined;

  const categories = [...new Set(recipes.items.map((r) => r.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'de'));
  const q = query.trim().toLowerCase();
  const shown = recipes.items.filter((r) =>
    (!category || r.category === category) &&
    (!q || r.title.toLowerCase().includes(q) || r.ingredients.toLowerCase().includes(q))
  );

  const editor = editing && (
    <RecipeForm
      recipe={editing.draft}
      onClose={() => setEditing(null)}
      onSave={async (data) => {
        if (editing.recipe) await recipes.update(editing.recipe.id, data);
        else navigate(`/rezepte/${(await recipes.create(data)).id}`);
      }}
      onDelete={editing.recipe ? async () => {
        await recipes.remove(editing.recipe!.id);
        navigate('/rezepte');
      } : undefined}
    />
  );

  if (recipeId) {
    return (
      <div className="page narrow">
        {selected ? (
          <RecipeDetail recipe={selected} onEdit={() => setEditing({ draft: selected, recipe: selected })} />
        ) : !recipes.loading && (
          <div className="card"><EmptyState icon="recipe" title="Rezept nicht gefunden"><Link to="/rezepte">Zu allen Rezepten</Link></EmptyState></div>
        )}
        {editor}
      </div>
    );
  }

  return (
    <div className="page">
      <header className="page-header">
        <h1>Rezepte</h1>
        <button className="button primary" onClick={() => setImporting(true)}><Icon name="plus" /> Rezept</button>
      </header>

      {recipes.items.length > 0 && (
        <>
          <input className="search" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rezept oder Zutat suchen …" aria-label="Rezepte durchsuchen" />
          {categories.length > 1 && (
            <div className="filter-bar" role="group" aria-label="Nach Kategorie filtern">
              <button className={`chip ${!category ? 'chip-active' : ''}`} onClick={() => setCategory(null)}>Alle</button>
              {categories.map((c) => (
                <button key={c} className={`chip ${category === c ? 'chip-active' : ''}`} onClick={() => setCategory(category === c ? null : c)}>{c}</button>
              ))}
            </div>
          )}
        </>
      )}

      {!recipes.loading && shown.length === 0 ? (
        <div className="card">
          <EmptyState icon="recipe" title={recipes.items.length ? 'Nichts gefunden' : 'Noch keine Rezepte'}>
            {!recipes.items.length && 'Füge einen Link von Chefkoch & Co. ein – das Rezept wird automatisch übernommen.'}
          </EmptyState>
        </div>
      ) : (
        <div className="recipe-grid">
          {shown.map((r) => (
            <Link key={r.id} to={`/rezepte/${r.id}`} className="card recipe-card">
              <div className="recipe-thumb">
                {r.image_url ? <img src={r.image_url} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <Icon name="recipe" size={32} />}
              </div>
              <div className="recipe-card-text">
                <strong>{r.title}</strong>
                <small className="muted">{[r.category, r.duration].filter(Boolean).join(' · ')}</small>
              </div>
            </Link>
          ))}
        </div>
      )}

      {importing && (
        <ImportDialog
          onClose={() => setImporting(false)}
          onDraft={(draft) => {
            setImporting(false);
            setEditing({ draft });
          }}
        />
      )}
      {editor}
    </div>
  );
}

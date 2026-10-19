import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { EmptyState } from '../components/EmptyState';
import { Icon } from '../components/Icon';
import { Modal } from '../components/Modal';
import { useAsync } from '../components/useAsync';
import { GROCERY_GROUPS, groupInfo, groupOf, guessGroup } from '../groceries';
import { usePermissions } from '../permissions';
import type { List, ListItem } from '../types';
import { useResource } from '../useResource';

function ListForm({ list, onSave, onDelete, onClose }: {
  list?: List;
  onSave(data: Partial<List>): Promise<unknown>;
  onDelete?(): Promise<unknown>;
  onClose(): void;
}) {
  const [name, setName] = useState(list?.name ?? '');
  const [kind, setKind] = useState<List['kind']>(list?.kind ?? 'shopping');
  const { busy, error, run } = useAsync();
  return (
    <Modal title={list ? 'Liste bearbeiten' : 'Neue Liste'} onClose={onClose}>
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          void run(async () => {
            await onSave({ name, kind });
            onClose();
          });
        }}
      >
        <label>
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="z. B. Supermarkt" required autoFocus />
        </label>
        <label>
          Art
          <select value={kind} onChange={(e) => setKind(e.target.value as List['kind'])}>
            <option value="shopping">Einkaufsliste</option>
            <option value="todo">To-do-Liste</option>
          </select>
        </label>
        {error && <p className="error">{error}</p>}
        <div className="form-actions">
          {onDelete && (
            <button
              type="button"
              className="button danger"
              onClick={() => confirm('Liste mit allen Einträgen löschen?') && void run(async () => {
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

function ItemForm({ item, shopping, onSave, onDelete, onClose }: {
  item: ListItem;
  shopping: boolean;
  onSave(data: Partial<ListItem>): Promise<unknown>;
  onDelete(): Promise<unknown>;
  onClose(): void;
}) {
  const [text, setText] = useState(item.text);
  const [quantity, setQuantity] = useState(item.quantity);
  const [category, setCategory] = useState(item.category ?? '');
  const { busy, error, run } = useAsync();
  const auto = groupInfo(guessGroup(text));
  return (
    <Modal title="Eintrag bearbeiten" onClose={onClose}>
      <form className="form" onSubmit={(e) => {
        e.preventDefault();
        void run(async () => {
          await onSave({ text, quantity, ...(shopping && { category: category || null }) });
          onClose();
        });
      }}>
        <label>Was?<input value={text} onChange={(e) => setText(e.target.value)} required autoFocus /></label>
        <label>Menge<input value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="z. B. 2 Stück" /></label>
        {shopping && (
          <label>
            Warengruppe
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">Automatisch ({auto.emoji} {auto.label})</option>
              {GROCERY_GROUPS.map((g) => <option key={g.id} value={g.id}>{g.emoji} {g.label}</option>)}
            </select>
          </label>
        )}
        {error && <p className="error">{error}</p>}
        <div className="form-actions">
          <button type="button" className="button danger" onClick={() => void run(async () => {
            await onDelete();
            onClose();
          })}>
            Löschen
          </button>
          <span className="spacer" />
          <button type="button" className="button" onClick={onClose}>Abbrechen</button>
          <button className="button primary" disabled={busy}>Speichern</button>
        </div>
      </form>
    </Modal>
  );
}

type SortMode = 'group' | 'added' | 'alpha';
const SORT_LABELS: Record<SortMode, string> = { group: 'Warengruppe', added: 'Reihenfolge', alpha: 'A–Z' };
const sortKey = (listId: number) => `familyconnect.listSort.${listId}`;

function useSortMode(list: List): [SortMode, (mode: SortMode) => void] {
  const fallback: SortMode = list.kind === 'shopping' ? 'group' : 'added';
  const read = () => {
    try {
      const stored = localStorage.getItem(sortKey(list.id)) as SortMode | null;
      return stored && stored in SORT_LABELS ? stored : fallback;
    } catch {
      return fallback;
    }
  };
  const [mode, setMode] = useState<SortMode>(read);
  // Beim Wechsel der Liste deren Einstellung laden
  useEffect(() => setMode(read()), [list.id]);
  const change = (next: SortMode) => {
    setMode(next);
    try {
      localStorage.setItem(sortKey(list.id), next);
    } catch {
      // nur für diese Sitzung
    }
  };
  return [list.kind === 'shopping' ? mode : 'added', change];
}

function ListDetail({ list, items, onEdit }: {
  list: List;
  items: ReturnType<typeof useResource<ListItem>>;
  onEdit(): void;
}) {
  const [text, setText] = useState('');
  const [quantity, setQuantity] = useState('');
  const [editing, setEditing] = useState<ListItem | null>(null);
  const [sort, setSort] = useSortMode(list);
  const { error, run } = useAsync();
  const { canEdit } = usePermissions();
  const shopping = list.kind === 'shopping';
  const own = items.items.filter((i) => i.list_id === list.id);
  const open = own.filter((i) => !i.done);
  const done = own.filter((i) => i.done);
  if (sort === 'alpha') open.sort((a, b) => a.text.localeCompare(b.text, 'de'));
  // Nach Warengruppen in der Reihenfolge des Einkaufs
  const groups = sort === 'group'
    ? GROCERY_GROUPS.map((g) => ({ ...g, items: open.filter((i) => groupOf(i) === g.id) })).filter((g) => g.items.length > 0)
    : [];

  const add = (e: FormEvent) => {
    e.preventDefault();
    const entry = { text, quantity };
    if (!entry.text.trim()) return;
    // Sofort leeren, damit man direkt den nächsten Eintrag tippen kann
    setText('');
    setQuantity('');
    void run(async () => {
      try {
        await items.create({ list_id: list.id, ...entry });
      } catch (err) {
        setText((current) => current || entry.text);
        setQuantity((current) => current || entry.quantity);
        throw err;
      }
    });
  };

  const row = (item: ListItem) => (
    <li key={item.id} className={`check-row ${item.done ? 'done' : ''}`}>
      <input type="checkbox" checked={item.done} onChange={() => void items.update(item.id, { done: !item.done })} aria-label={`${item.text} erledigt`} />
      <button type="button" className="item-main" onClick={() => setEditing(item)}>
        <span className="check-text">{item.text}</span>
        {item.quantity && <span className="badge">{item.quantity}</span>}
      </button>
      <button className="icon-button subtle" onClick={() => void items.remove(item.id)} aria-label="Eintrag löschen">
        <Icon name="trash" size={16} />
      </button>
    </li>
  );

  return (
    <section className="card list-detail">
      <header className="section-header">
        <Link to="/listen" className="icon-button only-mobile" aria-label="Zurück"><Icon name="left" /></Link>
        <h2>{list.is_default && <Icon name="cart" size={18} />} {list.name}</h2>
        <span className="spacer" />
        {!list.is_default && canEdit(list) && <button className="icon-button" onClick={onEdit} aria-label="Liste bearbeiten"><Icon name="edit" size={18} /></button>}
      </header>
      <form onSubmit={add} className="quick-add">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={list.kind === 'shopping' ? 'Was wird gebraucht?' : 'Was ist zu tun?'}
          aria-label="Neuer Eintrag"
        />
        {list.kind === 'shopping' && (
          <input value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="Menge" className="qty" aria-label="Menge" />
        )}
        <button className="button primary" aria-label="Hinzufügen"><Icon name="plus" /></button>
      </form>
      {error && <p className="error">{error}</p>}
      {own.length === 0 ? (
        <EmptyState icon="list" title="Die Liste ist leer" />
      ) : (
        <>
          {shopping && open.length > 1 && (
            <div className="list-sort" role="group" aria-label="Sortieren">
              <span className="muted">Sortieren:</span>
              {(Object.keys(SORT_LABELS) as SortMode[]).map((m) => (
                <button key={m} className={`chip ${sort === m ? 'chip-active' : ''}`} onClick={() => setSort(m)} aria-pressed={sort === m}>{SORT_LABELS[m]}</button>
              ))}
            </div>
          )}
          {sort === 'group' ? (
            groups.map((g) => (
              <section key={g.id} className="grocery-group">
                <h3 className="grocery-group-title"><span>{g.emoji}</span> {g.label} <span className="muted">{g.items.length}</span></h3>
                <ul className="check-list">{g.items.map(row)}</ul>
              </section>
            ))
          ) : (
            <ul className="check-list">{open.map(row)}</ul>
          )}
          {done.length > 0 && (
            <>
              <div className="section-header subtle-header">
                <span className="muted">Erledigt ({done.length})</span>
                <span className="spacer" />
                <button className="link-button" onClick={() => done.forEach((i) => void items.remove(i.id))}>
                  Erledigte entfernen
                </button>
              </div>
              <ul className="check-list">{done.map(row)}</ul>
            </>
          )}
        </>
      )}
      {editing && (
        <ItemForm
          item={editing}
          shopping={shopping}
          onClose={() => setEditing(null)}
          onSave={(data) => items.update(editing.id, data)}
          onDelete={() => items.remove(editing.id)}
        />
      )}
    </section>
  );
}

export function ListsPage() {
  const lists = useResource<List>('lists');
  const items = useResource<ListItem>('items');
  const { listId } = useParams();
  const navigate = useNavigate();
  const [editing, setEditing] = useState<List | 'new' | null>(null);
  const selected = lists.items.find((l) => l.id === Number(listId)) ?? (listId ? undefined : lists.items[0]);

  return (
    <div className="page">
      <header className="page-header">
        <h1>Listen</h1>
        <button className="button primary" onClick={() => setEditing('new')}><Icon name="plus" /> Liste</button>
      </header>

      {!lists.loading && lists.items.length === 0 ? (
        <div className="card">
          <EmptyState icon="list" title="Noch keine Listen">Lege eine Einkaufs- oder To-do-Liste an.</EmptyState>
        </div>
      ) : (
        <div className={`master-detail ${listId ? 'show-detail' : ''}`}>
          <nav className="card list-index">
            {lists.items.map((l) => {
              const openCount = items.items.filter((i) => i.list_id === l.id && !i.done).length;
              return (
                <Link key={l.id} to={`/listen/${l.id}`} className={`list-link ${selected?.id === l.id ? 'active' : ''}`}>
                  <Icon name={l.is_default ? 'cart' : l.kind === 'shopping' ? 'list' : 'check'} size={18} />
                  <span>{l.name}</span>
                  <span className="spacer" />
                  {openCount > 0 && <span className="badge">{openCount}</span>}
                </Link>
              );
            })}
          </nav>
          {selected && <ListDetail list={selected} items={items} onEdit={() => setEditing(selected)} />}
        </div>
      )}

      {editing && (
        <ListForm
          list={editing === 'new' ? undefined : editing}
          onClose={() => setEditing(null)}
          onSave={async (data) => {
            if (editing === 'new') navigate(`/listen/${(await lists.create(data)).id}`);
            else await lists.update(editing.id, data);
          }}
          onDelete={editing === 'new' ? undefined : async () => {
            await lists.remove(editing.id);
            navigate('/listen');
          }}
        />
      )}
    </div>
  );
}

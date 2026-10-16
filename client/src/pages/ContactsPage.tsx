import { useState, type FormEvent } from 'react';
import { initials } from '../components/Avatar';
import { EmptyState } from '../components/EmptyState';
import { Icon } from '../components/Icon';
import { Modal } from '../components/Modal';
import { useAsync } from '../components/useAsync';
import type { Contact } from '../types';
import { useResource } from '../useResource';

const FIELDS = ['name', 'category', 'phone', 'email', 'address', 'notes'] as const;
const CATEGORY_SUGGESTIONS = ['Ärzte', 'Schule', 'Kita', 'Babysitter', 'Notfall', 'Handwerker', 'Freunde', 'Verwandte'];

function ContactForm({ contact, onSave, onDelete, onClose }: {
  contact?: Contact;
  onSave(data: Partial<Contact>): Promise<unknown>;
  onDelete?(): Promise<unknown>;
  onClose(): void;
}) {
  const [data, setData] = useState(() => Object.fromEntries(FIELDS.map((f) => [f, contact?.[f] ?? ''])) as Record<(typeof FIELDS)[number], string>);
  const { busy, error, run } = useAsync();
  const set = (field: (typeof FIELDS)[number]) => (e: { target: { value: string } }) => setData({ ...data, [field]: e.target.value });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      await onSave(data);
      onClose();
    });
  };

  return (
    <Modal title={contact ? 'Kontakt bearbeiten' : 'Neuer Kontakt'} onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <label>Name<input value={data.name} onChange={set('name')} required autoFocus /></label>
        <label>
          Kategorie
          <input value={data.category} onChange={set('category')} list="contact-categories" placeholder="z. B. Ärzte" />
          <datalist id="contact-categories">
            {CATEGORY_SUGGESTIONS.map((c) => <option key={c} value={c} />)}
          </datalist>
        </label>
        <div className="row">
          <label>Telefon<input type="tel" value={data.phone} onChange={set('phone')} /></label>
          <label>E-Mail<input type="email" value={data.email} onChange={set('email')} /></label>
        </div>
        <label>Adresse<input value={data.address} onChange={set('address')} /></label>
        <label>Notizen<textarea value={data.notes} onChange={set('notes')} rows={3} /></label>
        {error && <p className="error">{error}</p>}
        <div className="form-actions">
          {onDelete && (
            <button type="button" className="button danger" onClick={() => confirm('Kontakt löschen?') && void run(async () => {
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

export function ContactsPage() {
  const contacts = useResource<Contact>('contacts');
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<Contact | 'new' | null>(null);

  const q = query.trim().toLowerCase();
  const filtered = contacts.items.filter((c) =>
    !q || [c.name, c.category, c.phone, c.email].some((v) => v.toLowerCase().includes(q))
  );
  const groups = new Map<string, Contact[]>();
  for (const c of filtered) {
    const key = c.category || 'Sonstige';
    groups.set(key, [...(groups.get(key) ?? []), c]);
  }
  const sortedGroups = [...groups.entries()].sort(([a], [b]) => (a === 'Sonstige' ? 1 : b === 'Sonstige' ? -1 : a.localeCompare(b, 'de')));

  return (
    <div className="page narrow">
      <header className="page-header">
        <h1>Kontakte</h1>
        <button className="button primary" onClick={() => setEditing('new')}><Icon name="plus" /> Kontakt</button>
      </header>
      <input className="search" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Suchen …" aria-label="Kontakte durchsuchen" />

      {!contacts.loading && filtered.length === 0 ? (
        <div className="card">
          <EmptyState icon="contacts" title={q ? 'Nichts gefunden' : 'Noch keine Kontakte'}>
            {!q && 'Sammle wichtige Nummern: Kinderarzt, Schule, Babysitter …'}
          </EmptyState>
        </div>
      ) : (
        sortedGroups.map(([category, items]) => (
          <section key={category} className="card">
            <h2 className="group-title">{category}</h2>
            {items.map((c) => (
              <div key={c.id} className="contact">
                <button className="contact-main" onClick={() => setEditing(c)}>
                  <span className="avatar neutral">{initials(c.name)}</span>
                  <span>
                    <strong>{c.name}</strong>
                    {c.address && <small className="muted">{c.address}</small>}
                  </span>
                </button>
                {c.phone && <a className="icon-button" href={`tel:${c.phone}`} aria-label={`${c.name} anrufen`}><Icon name="phone" size={18} /></a>}
                {c.email && <a className="icon-button" href={`mailto:${c.email}`} aria-label={`E-Mail an ${c.name}`}><Icon name="mail" size={18} /></a>}
              </div>
            ))}
          </section>
        ))
      )}

      {editing && (
        <ContactForm
          contact={editing === 'new' ? undefined : editing}
          onClose={() => setEditing(null)}
          onSave={(data) => (editing === 'new' ? contacts.create(data) : contacts.update(editing.id, data))}
          onDelete={editing === 'new' ? undefined : () => contacts.remove(editing.id)}
        />
      )}
    </div>
  );
}

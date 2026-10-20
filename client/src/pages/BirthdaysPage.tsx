import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { api } from '../api';
import { Avatar, initials } from '../components/Avatar';
import { EmptyState } from '../components/EmptyState';
import { Icon } from '../components/Icon';
import { Modal } from '../components/Modal';
import { useAsync } from '../components/useAsync';
import { untilLabel, upcomingBirthdays, useGiftIdeas, type UpcomingBirthday } from '../birthdays';
import { formatDayMonth } from '../dates';
import { usePermissions } from '../permissions';
import { useFamily } from '../session';
import type { Contact, Member } from '../types';
import { useResource } from '../useResource';

function GiftIdeas({ birthday }: { birthday: UpcomingBirthday }) {
  const gifts = useGiftIdeas();
  const [text, setText] = useState('');
  const { error, run } = useAsync();
  const target = birthday.member ? { for_user_id: birthday.member.id } : { for_contact_id: birthday.contact!.id };
  const ideas = gifts.items.filter((i) => (birthday.member ? i.for_user_id === birthday.member.id : i.for_contact_id === birthday.contact!.id));

  const add = (e: FormEvent) => {
    e.preventDefault();
    const idea = text.trim();
    if (!idea) return;
    setText('');
    void run(() => gifts.add({ ...target, text: idea }));
  };

  return (
    <div className="gift-ideas">
      <small className="muted">🎁 Geschenkideen{birthday.member && ` – ${birthday.name.split(' ')[0]} sieht sie nicht`}</small>
      {ideas.length > 0 && (
        <ul className="check-list">
          {ideas.map((i) => (
            <li key={i.id} className={`check-row ${i.bought ? 'done' : ''}`}>
              <label>
                <input type="checkbox" checked={i.bought} onChange={() => void run(() => gifts.toggle(i))} aria-label={`${i.text} gekauft`} />
                <span className="check-text">{i.text}</span>
                {i.bought && <span className="badge">gekauft</span>}
              </label>
              <button className="icon-button subtle" onClick={() => void run(() => gifts.remove(i))} aria-label="Idee löschen"><Icon name="trash" size={16} /></button>
            </li>
          ))}
        </ul>
      )}
      <form className="quick-add" onSubmit={add}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Idee hinzufügen …" aria-label={`Geschenkidee für ${birthday.name}`} />
        <button className="button" aria-label="Hinzufügen"><Icon name="plus" /></button>
      </form>
      {error && <p className="error">{error}</p>}
    </div>
  );
}

function BirthdayForm({ member, onClose }: { member: Member; onClose(): void }) {
  const { family, refreshUser } = useFamily();
  const [birthday, setBirthday] = useState(member.birthday ?? '');
  const { busy, error, run } = useAsync();
  return (
    <Modal title={`Geburtstag von ${member.name}`} onClose={onClose}>
      <form className="form" onSubmit={(e) => {
        e.preventDefault();
        void run(async () => {
          await api(`/families/${family.id}/members/${member.id}/birthday`, { method: 'PUT', body: { birthday: birthday || null } });
          await refreshUser();
          onClose();
        });
      }}>
        <label>Geburtstag<input type="date" value={birthday} onChange={(e) => setBirthday(e.target.value)} max={new Date().toLocaleDateString('sv-SE')} /></label>
        {error && <p className="error">{error}</p>}
        <div className="form-actions">
          <span className="spacer" />
          <button type="button" className="button" onClick={onClose}>Abbrechen</button>
          <button className="button primary" disabled={busy}>Speichern</button>
        </div>
      </form>
    </Modal>
  );
}

/** Geburtstag von jemandem außerhalb der App (Oma, Freunde …) – wird als Kontakt gespeichert */
function OtherBirthdayForm({ contact, contacts, onSave, onClose }: {
  contact?: Contact;
  contacts: Contact[];
  onSave(data: Partial<Contact>, existing?: Contact): Promise<unknown>;
  onClose(): void;
}) {
  const [name, setName] = useState(contact?.name ?? '');
  const [birthday, setBirthday] = useState(contact?.birthday ?? '');
  const { busy, error, run } = useAsync();
  // Gibt es den Kontakt schon (ohne Geburtstag), bekommt er nur den Geburtstag dazu
  const match = contact ?? contacts.find((c) => c.name.trim().toLowerCase() === name.trim().toLowerCase());
  return (
    <Modal title={contact ? `Geburtstag von ${contact.name}` : 'Geburtstag eintragen'} onClose={onClose}>
      <form className="form" onSubmit={(e) => {
        e.preventDefault();
        void run(async () => {
          await onSave({ name: name.trim(), birthday: birthday || null }, match);
          onClose();
        });
      }}>
        <label>Name<input value={name} onChange={(e) => setName(e.target.value)} placeholder="z. B. Oma Ayşe" maxLength={200} required autoFocus={!contact} /></label>
        <label>Geburtstag<input type="date" value={birthday} onChange={(e) => setBirthday(e.target.value)} max={new Date().toLocaleDateString('sv-SE')} required={!contact} /></label>
        {!contact && match && <small className="hint">„{match.name}“ steht schon bei den Kontakten – der Geburtstag wird dort ergänzt.</small>}
        {!contact && !match && <small className="hint">Wird auch bei den Kontakten gespeichert, dort kannst du Telefon & Co. ergänzen.</small>}
        {error && <p className="error">{error}</p>}
        <div className="form-actions">
          {contact && (
            <button type="button" className="button danger" disabled={busy} onClick={() => void run(async () => {
              await onSave({ birthday: null }, contact);
              onClose();
            })}>Geburtstag entfernen</button>
          )}
          <span className="spacer" />
          <button type="button" className="button" onClick={onClose}>Abbrechen</button>
          <button className="button primary" disabled={busy}>Speichern</button>
        </div>
      </form>
    </Modal>
  );
}

export function BirthdaysPage() {
  const { family, user } = useFamily();
  const { isManager } = usePermissions();
  const contacts = useResource<Contact>('contacts');
  const [open, setOpen] = useState<string | null>(null);
  const [editing, setEditing] = useState<Member | null>(null);
  const [editingOther, setEditingOther] = useState<Contact | 'new' | null>(null);
  const list = upcomingBirthdays(family.members, contacts.items);
  const missing = family.members.filter((m) => !m.birthday && (isManager || m.id === user.id));

  return (
    <div className="page narrow">
      <header className="page-header">
        <h1>Geburtstage</h1>
        <button className="button primary" onClick={() => setEditingOther('new')}><Icon name="plus" /> Geburtstag</button>
      </header>

      {missing.length > 0 && (
        <section className="card">
          <h2>Noch ohne Geburtstag</h2>
          <div className="member-picker">
            {missing.map((m) => (
              <button key={m.id} className="chip" onClick={() => setEditing(m)}>
                <Avatar member={m} size={20} /> {m.name} <Icon name="plus" size={14} />
              </button>
            ))}
          </div>
        </section>
      )}

      {list.length === 0 ? (
        <div className="card"><EmptyState icon="cake" title="Noch keine Geburtstage eingetragen" /></div>
      ) : (
        list.map((b) => {
          const isMe = b.member?.id === user.id;
          return (
            <section key={b.key} className={`card birthday-card ${b.daysUntil === 0 ? 'is-today' : ''}`}>
              <button className="birthday-main" onClick={() => setOpen(open === b.key ? null : b.key)} aria-expanded={open === b.key}>
                {b.member ? <Avatar member={b.member} size={40} /> : <span className="avatar neutral" style={{ width: 40, height: 40 }}>{initials(b.name)}</span>}
                <span className="birthday-text">
                  <strong>{b.name}{isMe && ' (du)'}</strong>
                  <small className="muted">{formatDayMonth(b.date)} · wird {b.age}</small>
                </span>
                <span className={`birthday-until ${b.daysUntil <= 7 ? 'soon' : ''}`}>{untilLabel(b.daysUntil)}</span>
              </button>
              {open === b.key && (
                <div className="birthday-more">
                  {b.member && (
                    <Link className="link-button wish-jump" to={isMe ? '/wuensche' : `/wuensche?person=${b.member.id}`}>
                      🎁 {isMe ? 'Meine Wunschliste' : `Wunschliste von ${b.name.split(' ')[0]}`}
                    </Link>
                  )}
                  {!isMe && <GiftIdeas birthday={b} />}
                  {b.member && (isManager || isMe) && (
                    <button className="link-button" onClick={() => setEditing(b.member!)}>Geburtstag ändern</button>
                  )}
                  {b.contact && (
                    <button className="link-button" onClick={() => setEditingOther(b.contact!)}>Geburtstag ändern</button>
                  )}
                </div>
              )}
            </section>
          );
        })
      )}

      {editing && <BirthdayForm member={editing} onClose={() => setEditing(null)} />}
      {editingOther && (
        <OtherBirthdayForm
          contact={editingOther === 'new' ? undefined : editingOther}
          contacts={contacts.items}
          onClose={() => setEditingOther(null)}
          onSave={(data, existing) => existing
            ? contacts.update(existing.id, { birthday: data.birthday, ...(data.name && { name: data.name }) })
            : contacts.create({ ...data, category: 'Geburtstag' })}
        />
      )}
    </div>
  );
}

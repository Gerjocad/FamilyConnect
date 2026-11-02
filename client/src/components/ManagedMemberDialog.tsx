import { useState } from 'react';
import { Avatar, initials as nameInitials } from './Avatar';
import { api } from '../api';
import { useFamily } from '../session';
import type { Family, Member } from '../types';
import { Modal } from './Modal';
import { useAsync } from './useAsync';

const COLORS = ['#e8590c', '#1c7ed6', '#2f9e44', '#c2255c', '#7048e8', '#0c8599'];

/** Mitglied bearbeiten (nur Admins): Kürzel bei allen; ohne eigenes Handy auch Name/Farbe und später einen Zugang einrichten */
export function ManagedMemberDialog({ member, onClose }: { member: Member; onClose(): void }) {
  const { family, setFamily } = useFamily();
  const [name, setName] = useState(member.name);
  const [color, setColor] = useState(member.color);
  const [short, setShort] = useState(member.initials ?? '');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'edit' | 'account'>('edit');
  const { busy, error, run } = useAsync();
  const path = `/families/${family.id}/members/${member.id}`;

  return (
    <Modal title={mode === 'edit' ? member.name : `Zugang für ${member.name}`} onClose={onClose}>
      {mode === 'edit' ? (
        <form className="form" onSubmit={(e) => {
          e.preventDefault();
          void run(async () => {
            setFamily(await api<Family>(path, { method: 'PATCH', body: { initials: short.trim() || null, ...(member.managed && { name, color }) } }));
            onClose();
          });
        }}>
          <div className="row align-end initials-row">
            <Avatar member={{ name, color, initials: short.trim().toUpperCase() || null }} size={40} />
            <label>
              Kürzel <span className="hint">(bis 3 Zeichen, leer = „{nameInitials(name)}“)</span>
              <input value={short} onChange={(e) => setShort(e.target.value.slice(0, 3))} placeholder={nameInitials(name)} maxLength={3} aria-label="Kürzel" autoFocus={!member.managed} />
            </label>
          </div>
          {member.managed && <>
          <label>Name<input value={name} onChange={(e) => setName(e.target.value)} maxLength={100} required /></label>
          <div className="field">
            <span>Farbe</span>
            <div className="color-picker">
              {COLORS.map((c) => (
                <button type="button" key={c} className={`swatch ${color === c ? 'active' : ''}`} style={{ background: c }}
                  aria-label={`Farbe ${c}`} aria-pressed={color === c} onClick={() => setColor(c)} />
              ))}
            </div>
          </div>
          <p className="hint">
            {member.name.split(' ')[0]} hat noch kein eigenes Handy. Aufgaben, Dienste, Termine und Geburtstag kannst du trotzdem
            für {member.name.split(' ')[0]} eintragen.
          </p>
          <button type="button" className="link-button align-start" onClick={() => setMode('account')}>
            Hat jetzt ein Handy? Zugang einrichten
          </button>
          </>}
          {error && <p className="error">{error}</p>}
          <div className="form-actions">
            <span className="spacer" />
            <button type="button" className="button" onClick={onClose}>Abbrechen</button>
            <button className="button primary" disabled={busy}>Speichern</button>
          </div>
        </form>
      ) : (
        <form className="form" onSubmit={(e) => {
          e.preventDefault();
          void run(async () => {
            setFamily(await api<Family>(`${path}/account`, { method: 'PUT', body: { email, password } }));
            onClose();
          });
        }}>
          <p className="muted">
            Mit dieser E-Mail-Adresse und dem Passwort meldet sich {member.name.split(' ')[0]} auf dem eigenen Handy an
            („Anmelden“, nicht „Registrieren“). Alles bisher Eingetragene bleibt erhalten.
          </p>
          <label>E-Mail<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" required /></label>
          <label>Passwort <span className="hint">(mind. 8 Zeichen)</span>
            <input type="text" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} autoComplete="new-password" required />
          </label>
          {error && <p className="error">{error}</p>}
          <div className="form-actions">
            <button type="button" className="button" onClick={() => setMode('edit')}>Zurück</button>
            <span className="spacer" />
            <button className="button primary" disabled={busy}>Zugang einrichten</button>
          </div>
        </form>
      )}
    </Modal>
  );
}

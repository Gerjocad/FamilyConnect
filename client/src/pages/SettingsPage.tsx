import { useEffect, useState, type FormEvent } from 'react';
import { api, isNativeApp } from '../api';
import { availableUpdate, installUpdate, installedVersion, type AppVersion } from '../appUpdate';
import { Avatar } from '../components/Avatar';
import { Icon } from '../components/Icon';
import { useAsync } from '../components/useAsync';
import { useFamily } from '../session';
import type { Family } from '../types';

const COLORS = ['#e8590c', '#1c7ed6', '#2f9e44', '#c2255c', '#7048e8', '#0c8599', '#e67700', '#5c940d', '#495057'];

export function SettingsPage() {
  const { user, family, refreshUser, setFamily, selectFamily, signOut } = useFamily();
  const isAdmin = family.members.find((m) => m.id === user.id)?.role === 'admin';
  const [name, setName] = useState(user.name);
  const [familyName, setFamilyName] = useState(family.name);
  const [newFamily, setNewFamily] = useState('');
  const [code, setCode] = useState('');
  const [copied, setCopied] = useState(false);
  const profile = useAsync();
  const fam = useAsync();
  const other = useAsync();
  const [version, setVersion] = useState<AppVersion | null>(null);
  const [updateInfo, setUpdateInfo] = useState<string | null>(null);
  useEffect(() => {
    void installedVersion().then(setVersion).catch(() => {});
  }, []);

  const checkUpdate = async () => {
    setUpdateInfo('Suche …');
    const update = await availableUpdate();
    if (update) {
      setUpdateInfo(`Version ${update.versionName} wird heruntergeladen …`);
      installUpdate(update);
    } else {
      setUpdateInfo('Du hast die neueste Version.');
    }
  };

  const saveProfile = (patch: { name?: string; color?: string }) =>
    void profile.run(async () => {
      await api('/me', { method: 'PATCH', body: patch });
      await refreshUser();
    });

  const switchTo = async (next: Family) => {
    setFamily(next);
    await refreshUser();
  };

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(family.invite_code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Zwischenablage nicht verfügbar – Code ist ja sichtbar
    }
  };

  return (
    <div className="page narrow">
      <header className="page-header"><h1>Familie & Profil</h1></header>

      <section className="card">
        <h2>Mein Profil</h2>
        <form className="form" onSubmit={(e: FormEvent) => { e.preventDefault(); saveProfile({ name }); }}>
          <div className="row align-end">
            <label>Name<input value={name} onChange={(e) => setName(e.target.value)} required /></label>
            <button className="button" disabled={profile.busy || name === user.name}>Speichern</button>
          </div>
          <div className="field">
            <span>Meine Farbe</span>
            <div className="color-picker">
              {COLORS.map((c) => (
                <button
                  type="button"
                  key={c}
                  className={`swatch ${user.color === c ? 'active' : ''}`}
                  style={{ background: c }}
                  aria-label={`Farbe ${c}`}
                  aria-pressed={user.color === c}
                  onClick={() => saveProfile({ color: c })}
                />
              ))}
            </div>
          </div>
          {profile.error && <p className="error">{profile.error}</p>}
        </form>
        <p className="muted">Angemeldet als {user.email}</p>
      </section>

      <section className="card">
        <h2>{family.name}</h2>
        {isAdmin && (
          <form className="form" onSubmit={(e) => {
            e.preventDefault();
            void fam.run(async () => switchTo(await api<Family>(`/families/${family.id}`, { method: 'PATCH', body: { name: familyName } })));
          }}>
            <div className="row align-end">
              <label>Name der Familie<input value={familyName} onChange={(e) => setFamilyName(e.target.value)} required /></label>
              <button className="button" disabled={fam.busy || familyName === family.name}>Umbenennen</button>
            </div>
          </form>
        )}

        <div className="invite">
          <div>
            <span className="muted">Einladungscode</span>
            <code className="invite-code">{family.invite_code}</code>
            <small className="muted">Neue Mitglieder registrieren sich und geben diesen Code ein.</small>
          </div>
          <div className="invite-actions">
            <button className="button" onClick={() => void copyCode()}><Icon name="copy" size={18} /> {copied ? 'Kopiert!' : 'Kopieren'}</button>
            {isAdmin && (
              <button
                className="button"
                onClick={() => confirm('Neuen Code erzeugen? Der alte Code wird ungültig.') &&
                  void fam.run(async () => setFamily(await api<Family>(`/families/${family.id}/invite-code`, { method: 'POST' })))}
              >
                Neuer Code
              </button>
            )}
          </div>
        </div>

        <h3>Mitglieder ({family.members.length})</h3>
        <ul className="plain-list members">
          {family.members.map((m) => (
            <li key={m.id}>
              <Avatar member={m} size={32} />
              <span>{m.name}{m.id === user.id && ' (du)'}</span>
              <span className="spacer" />
              {m.role === 'admin' && <span className="badge">Admin</span>}
            </li>
          ))}
        </ul>
        {fam.error && <p className="error">{fam.error}</p>}
        <button
          className="button danger"
          onClick={() => confirm(`„${family.name}“ wirklich verlassen?`) && void fam.run(async () => {
            await api(`/families/${family.id}/leave`, { method: 'POST' });
            selectFamily(null);
            await refreshUser();
          })}
        >
          Familie verlassen
        </button>
      </section>

      <section className="card">
        <h2>Weitere Familie oder Gruppe</h2>
        <p className="muted">Zum Beispiel für die Großeltern, die WG oder den Sportverein.</p>
        <form className="form" onSubmit={(e) => {
          e.preventDefault();
          void other.run(async () => switchTo(await api<Family>('/families', { method: 'POST', body: { name: newFamily } })));
        }}>
          <div className="row align-end">
            <label>Neue Gruppe<input value={newFamily} onChange={(e) => setNewFamily(e.target.value)} required /></label>
            <button className="button">Erstellen</button>
          </div>
        </form>
        <form className="form" onSubmit={(e) => {
          e.preventDefault();
          void other.run(async () => switchTo(await api<Family>('/families/join', { method: 'POST', body: { code } })));
        }}>
          <div className="row align-end">
            <label>Einladungscode<input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} className="code-input" required /></label>
            <button className="button">Beitreten</button>
          </div>
        </form>
        {other.error && <p className="error">{other.error}</p>}
      </section>

      {isNativeApp && (
        <section className="card">
          <h2>App</h2>
          <div className="row align-end">
            <p className="muted spacer">Version {version ? `${version.versionName} (${version.versionCode})` : '…'}</p>
            <button className="button" onClick={() => void checkUpdate()}><Icon name="download" size={18} /> Nach Updates suchen</button>
          </div>
          {updateInfo && <p className="muted">{updateInfo}</p>}
        </section>
      )}

      <button className="button wide" onClick={() => void signOut()}><Icon name="logout" size={18} /> Abmelden</button>
    </div>
  );
}

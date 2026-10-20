import { useEffect, useState, type FormEvent } from 'react';
import { api, isNativeApp } from '../api';
import { availableUpdate, installUpdate, installedVersion, type AppVersion } from '../appUpdate';
import { CHANGELOG, CURRENT_VERSION, hasUnseenChanges } from '../changelog';
import { Link } from 'react-router';
import { Avatar } from '../components/Avatar';
import { ClimateSettings } from '../components/ClimateSettings';
import { ServerUpdateCard } from '../components/ServerUpdateCard';
import { ManagedMemberDialog } from '../components/ManagedMemberDialog';
import { Icon } from '../components/Icon';
import { WeatherPlace } from '../components/WeatherPlace';
import { useAsync } from '../components/useAsync';
import { useFamily } from '../session';
import { STATES } from '../holidays';
import { applyTheme, THEMES } from '../themes';
import { ROLE_LABELS } from '../permissions';
import type { Family, Member, Role } from '../types';

const COLORS = ['#e8590c', '#1c7ed6', '#2f9e44', '#c2255c', '#7048e8', '#0c8599'];

export function SettingsPage() {
  const { user, family, refreshUser, setFamily, selectFamily, signOut } = useFamily();
  const me = family.members.find((m) => m.id === user.id);
  const isAdmin = me?.role === 'admin';
  const [name, setName] = useState(user.name);
  const [familyName, setFamilyName] = useState(family.name);
  const [newFamily, setNewFamily] = useState('');
  const [code, setCode] = useState('');
  const [copied, setCopied] = useState(false);
  const [newMember, setNewMember] = useState('');
  const [editingMember, setEditingMember] = useState<Member | null>(null);
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

  const saveProfile = (patch: { name?: string; color?: string; theme?: string }) =>
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
          <label>
            Geburtstag
            <input
              type="date"
              value={me?.birthday ?? ''}
              max={new Date().toLocaleDateString('sv-SE')}
              onChange={(e) => void profile.run(async () => {
                await api(`/families/${family.id}/members/${user.id}/birthday`, { method: 'PUT', body: { birthday: e.target.value || null } });
              })}
            />
          </label>
          <div className="field">
            <span>App-Farbe</span>
            <div className="theme-picker" role="group" aria-label="App-Farbe">
              {THEMES.map((t) => (
                <button
                  type="button"
                  key={t.id}
                  className={`theme-option ${(user.theme ?? 'orange') === t.id ? 'active' : ''}`}
                  aria-pressed={(user.theme ?? 'orange') === t.id}
                  onClick={() => {
                    // Sofort umfärben, gespeichert wird im Hintergrund
                    applyTheme(t.id);
                    saveProfile({ theme: t.id });
                  }}
                >
                  <span className="theme-swatch" style={{ background: `linear-gradient(135deg, ${t.preview[0]} 50%, ${t.preview[1]} 50%)` }} />
                  {t.label}
                </button>
              ))}
            </div>
            <small className="hint">Gilt nur für dich – auf allen deinen Geräten.</small>
          </div>
          {profile.error && <p className="error">{profile.error}</p>}
        </form>
        <p className="muted">Angemeldet als {user.email}</p>
      </section>

      {/* Familienverwaltung nur für Admins – Eltern und Kinder sehen nur ihr Profil */}
      {isAdmin && (
        <>
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

        <label>
          Bundesland <span className="hint">(für Ferien und Feiertage im Kalender)</span>
          <select
            value={family.state ?? ''}
            onChange={(e) => void fam.run(async () => setFamily(await api<Family>(`/families/${family.id}`, { method: 'PATCH', body: { state: e.target.value || null } })))}
          >
            <option value="">Keins</option>
            {Object.entries(STATES).map(([code, name]) => <option key={code} value={code}>{name}</option>)}
          </select>
        </label>

        {isAdmin && <WeatherPlace onSaved={setFamily} />}

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
        {isAdmin && (
          <p className="hint">
            Neue Mitglieder starten als Kind. Eltern dürfen alles bearbeiten, Admins zusätzlich Rollen vergeben,
            Mitglieder entfernen und die Familie verwalten. Kinder dürfen alles sehen, aber nur ihre eigenen Termine und
            Aufgaben ändern und keine Gewohnheiten anlegen.
          </p>
        )}
        <ul className="plain-list members">
          {family.members.map((m) => (
            <li key={m.id}>
              <Avatar member={m} size={32} />
              <span className="member-name">
                {m.name}{m.id === user.id && ' (du)'}
                {m.managed && <small className="badge managed-badge">ohne Handy</small>}
              </span>
              <span className="spacer" />
              {isAdmin && m.managed && (
                <button className="icon-button subtle" aria-label={`${m.name} bearbeiten`} onClick={() => setEditingMember(m)}>
                  <Icon name="edit" size={16} />
                </button>
              )}
              {isAdmin ? (
                <>
                  <select
                    className="role-select"
                    value={m.role}
                    aria-label={`Rolle von ${m.name}`}
                    disabled={fam.busy}
                    onChange={(e) => void fam.run(async () => setFamily(await api<Family>(`/families/${family.id}/members/${m.id}`, { method: 'PATCH', body: { role: e.target.value } })))}
                  >
                    {(Object.keys(ROLE_LABELS) as Role[]).map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                  </select>
                  {m.id !== user.id ? (
                    <button
                      className="icon-button subtle"
                      aria-label={`${m.name} entfernen`}
                      disabled={fam.busy}
                      onClick={() => confirm(`${m.name} aus „${family.name}“ entfernen?`) &&
                        void fam.run(async () => setFamily(await api<Family>(`/families/${family.id}/members/${m.id}`, { method: 'DELETE' })))}
                    >
                      <Icon name="trash" size={16} />
                    </button>
                  ) : (
                    <span className="icon-button-placeholder" />
                  )}
                </>
              ) : (
                <span className={`badge role-${m.role}`}>{ROLE_LABELS[m.role]}</span>
              )}
            </li>
          ))}
        </ul>
        {isAdmin && (
          <form className="form" onSubmit={(e) => {
            e.preventDefault();
            void fam.run(async () => {
              setFamily(await api<Family>(`/families/${family.id}/members/managed`, { method: 'POST', body: { name: newMember } }));
              setNewMember('');
            });
          }}>
            <div className="row align-end">
              <label>
                Mitglied ohne Handy <span className="hint">(z. B. jüngeres Kind)</span>
                <input value={newMember} onChange={(e) => setNewMember(e.target.value)} placeholder="Name" maxLength={100} required />
              </label>
              <button className="button" disabled={fam.busy}><Icon name="plus" size={18} /> Hinzufügen</button>
            </div>
          </form>
        )}
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

        </>
      )}

      {isAdmin && (
        <section className="card">
          <h2><Icon name="thermometer" size={18} /> Thermometer</h2>
          <ClimateSettings />
        </section>
      )}

      {isAdmin && (
        <section className="card">
          <h2><Icon name="repeat" size={18} /> Server</h2>
          <ServerUpdateCard />
        </section>
      )}

      <Link to="/neuigkeiten" className="card news-link">
        <Icon name="sparkle" size={22} />
        <span>
          <strong>Neuigkeiten {hasUnseenChanges() && <span className="badge">Neu</span>}</strong>
          <small className="muted">Version {CURRENT_VERSION}: {CHANGELOG[0].title}</small>
        </span>
        <Icon name="right" size={18} />
      </Link>

      {isNativeApp && (
        <section className="card">
          <h2>App</h2>
          <div className="row align-end">
            <p className="muted spacer">App-Version {version ? `${version.versionName} (${version.versionCode})` : '…'}</p>
            <button className="button" onClick={() => void checkUpdate()}><Icon name="download" size={18} /> Nach Updates suchen</button>
          </div>
          {updateInfo && <p className="muted">{updateInfo}</p>}
        </section>
      )}

      <button className="button wide" onClick={() => void signOut()}><Icon name="logout" size={18} /> Abmelden</button>
      {editingMember && <ManagedMemberDialog member={editingMember} onClose={() => setEditingMember(null)} />}
    </div>
  );
}

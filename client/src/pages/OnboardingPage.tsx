import { useState, type FormEvent } from 'react';
import { api } from '../api';
import { useAsync } from '../components/useAsync';
import { useSession } from '../session';
import type { Family } from '../types';

export function OnboardingPage() {
  const { user, refreshUser, setFamily, signOut } = useSession();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const create = useAsync();
  const join = useAsync();

  const done = async (family: Family) => {
    setFamily(family);
    await refreshUser();
  };

  const submitCreate = (e: FormEvent) => {
    e.preventDefault();
    void create.run(async () => done(await api<Family>('/families', { method: 'POST', body: { name } })));
  };

  const submitJoin = (e: FormEvent) => {
    e.preventDefault();
    void join.run(async () => done(await api<Family>('/families/join', { method: 'POST', body: { code } })));
  };

  return (
    <div className="auth">
      <div className="auth-card card">
        <img src="/icon.svg" alt="" width={56} height={56} />
        <h1>Hallo {user?.name}!</h1>
        <p className="muted">Gründe einen Familienbereich oder tritt mit einem Einladungscode einem bestehenden bei.</p>

        <form onSubmit={submitCreate} className="form">
          <h2>Neue Familie</h2>
          <label>
            Name
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="z. B. Familie Müller" required />
          </label>
          {create.error && <p className="error">{create.error}</p>}
          <button className="button primary" disabled={create.busy}>Familie erstellen</button>
        </form>

        <div className="divider"><span>oder</span></div>

        <form onSubmit={submitJoin} className="form">
          <h2>Einladung annehmen</h2>
          <label>
            Einladungscode
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="ABCD2345"
              className="code-input"
              autoCapitalize="characters"
              required
            />
          </label>
          {join.error && <p className="error">{join.error}</p>}
          <button className="button" disabled={join.busy}>Beitreten</button>
        </form>

        <button type="button" className="link-button" onClick={() => void signOut()}>Abmelden</button>
      </div>
    </div>
  );
}

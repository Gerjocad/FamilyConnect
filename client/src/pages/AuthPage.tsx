import { useState, type FormEvent } from 'react';
import { api, checkServer, getServerUrl, isNativeApp, normalizeServerUrl, setServerUrl } from '../api';
import { useAsync } from '../components/useAsync';
import { useSession } from '../session';

export function AuthPage() {
  const { signIn } = useSession();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [server, setServer] = useState(getServerUrl);
  const { busy, error, run, setError } = useAsync();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      if (isNativeApp) {
        const url = normalizeServerUrl(server);
        await checkServer(url);
        setServerUrl(url);
        setServer(url);
      }
      const path = mode === 'login' ? '/auth/login' : '/auth/register';
      const body = mode === 'login' ? { email, password } : { name, email, password };
      const { token } = await api<{ token: string }>(path, { method: 'POST', body });
      await signIn(token);
    });
  };

  return (
    <div className="auth">
      <div className="auth-card card">
        <img src="/icon.svg" alt="" width={56} height={56} />
        <h1>FamilyConnect</h1>
        <p className="muted">Kalender, Listen, Aufgaben und Nachrichten – an einem Ort für die ganze Familie.</p>

        <div className="segmented" role="tablist">
          {(['login', 'register'] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={mode === m}
              className={mode === m ? 'active' : ''}
              onClick={() => {
                setMode(m);
                setError(null);
              }}
            >
              {m === 'login' ? 'Anmelden' : 'Registrieren'}
            </button>
          ))}
        </div>

        <form onSubmit={submit} className="form">
          {isNativeApp && (
            <label>
              Server-Adresse
              <input
                value={server}
                onChange={(e) => setServer(e.target.value)}
                placeholder="z. B. 192.168.178.20:3001"
                inputMode="url"
                autoCapitalize="none"
                autoCorrect="off"
                required
              />
              <small className="hint">Die Adresse des Rechners, auf dem der FamilyConnect-Server läuft.</small>
            </label>
          )}
          {mode === 'register' && (
            <label>
              Dein Name
              <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required />
            </label>
          )}
          <label>
            E-Mail
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
          </label>
          <label>
            Passwort
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              minLength={mode === 'register' ? 8 : undefined}
              required
            />
          </label>
          {error && <p className="error">{error}</p>}
          <button className="button primary" disabled={busy}>
            {mode === 'login' ? 'Anmelden' : 'Konto erstellen'}
          </button>
        </form>
      </div>
    </div>
  );
}

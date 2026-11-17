import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { EmptyState } from '../components/EmptyState';
import { useAsync } from '../components/useAsync';
import { useFamily } from '../session';
import { PHASE_LABEL, useWakeLights, type Phase, type Times, type WakeLight } from '../wakeLight';

const ROWS: { key: keyof Times; label: string; hint: string }[] = [
  { key: 'moon', label: '🌙 Mond ab', hint: 'abends – Schlafenszeit' },
  { key: 'dawn', label: '🌅 Sonnenaufgang ab', hint: 'die Sonne geht langsam auf' },
  { key: 'sun', label: '☀️ Sonne ganz oben', hint: 'jetzt darf aufgestanden werden' },
  { key: 'off', label: '⚫ Licht aus', hint: 'morgens, danach bleibt es aus' },
];

function TimesEditor({ light, save }: { light: WakeLight; save(body: Partial<WakeLight>): Promise<unknown> }) {
  const [school, setSchool] = useState(light.school);
  const [free, setFree] = useState(light.free);
  const [holidays, setHolidays] = useState(light.holidays_free);
  const [saved, setSaved] = useState(false);
  const { busy, error, run } = useAsync();
  const changed = JSON.stringify([school, free, holidays]) !== JSON.stringify([light.school, light.free, light.holidays_free]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      await save({ school, free, holidays_free: holidays });
      setSaved(true);
    });
  };
  return (
    <form className="wake-times" onSubmit={submit}>
      <table className="plain-table">
        <thead><tr><th /><th>Schultage</th><th>Freie Tage</th></tr></thead>
        <tbody>
          {ROWS.map((r) => (
            <tr key={r.key}>
              <td><b>{r.label}</b><br /><small className="muted">{r.hint}</small></td>
              <td><input type="time" required value={school[r.key]} onChange={(e) => { setSaved(false); setSchool({ ...school, [r.key]: e.target.value }); }} aria-label={`${r.label} an Schultagen`} /></td>
              <td><input type="time" required value={free[r.key]} onChange={(e) => { setSaved(false); setFree({ ...free, [r.key]: e.target.value }); }} aria-label={`${r.label} an freien Tagen`} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      <label className="checkbox">
        <input type="checkbox" checked={holidays} onChange={(e) => { setSaved(false); setHolidays(e.target.checked); }} />
        Feiertage und Schulferien zählen als freie Tage
      </label>
      <small className="hint">Freie Tage sind Samstag und Sonntag{holidays ? ', Feiertage und Ferien (Bundesland aus den Familien-Einstellungen)' : ''}. Der Mond am Abend richtet sich nach dem nächsten Morgen – freitags gilt also schon die Zeit für freie Tage.</small>
      {error && <p className="error">{error}</p>}
      <div className="form-actions">
        {saved && !changed && <span className="success">✓ Gespeichert</span>}
        <span className="spacer" />
        <button className="button primary" disabled={busy || !changed}>Zeiten speichern</button>
      </div>
    </form>
  );
}

function Brightness({ label, value, min, onSave }: { label: string; value: number; min: number; onSave(v: number): void }) {
  const [v, setV] = useState<number | null>(null);
  const shown = v ?? value;
  const commit = () => {
    if (v !== null && v !== value) onSave(v);
    setV(null);
  };
  return (
    <label className="wake-slider">
      <span>{label} <b>{shown === 0 ? 'aus' : `${shown} %`}</b></span>
      <input type="range" min={min} max={100} step={5} value={shown} onChange={(e) => setV(Number(e.target.value))} onPointerUp={commit} onKeyUp={commit} onBlur={commit} />
    </label>
  );
}

function LightCard({ light, onUpdate, onTest, onRemove }: {
  light: WakeLight;
  onUpdate(body: Partial<WakeLight>): Promise<unknown>;
  onTest(show: Phase | null): Promise<unknown>;
  onRemove(): Promise<unknown>;
}) {
  const { family, member } = useFamily();
  const { error, run } = useAsync();
  const kid = light.member_id ? member(light.member_id) : null;
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const day = light.next_sun.date === tomorrow ? 'morgen' : 'heute';

  return (
    <section className="card wake-card">
      <header className="section-header">
        <h2>🌙 {light.name}{kid && <small className="muted"> · {kid.name.split(' ')[0]}</small>}</h2>
        <span className="spacer" />
        <span className={`wake-online ${light.online ? 'on' : ''}`}>{light.online ? '● online' : '○ offline'}</span>
      </header>
      <p className="wake-status">
        Gerade: <b>{PHASE_LABEL[light.phase]}</b> · Sonne {day} um <b>{light.next_sun.time}</b> Uhr{light.next_sun.free && ' (freier Tag)'}
      </p>
      {!light.last_seen_at && (
        <p className="hint">Noch nie verbunden – zuerst <Link to={`/schlaflicht/${light.id}/einrichten`}>per USB einrichten</Link> (am PC in Chrome/Edge).</p>
      )}

      <h3>Uhrzeiten</h3>
      <TimesEditor light={light} save={onUpdate} />

      <h3>Helligkeit</h3>
      <Brightness label="☀️ Sonne" value={light.sun_brightness} min={5} onSave={(v) => void run(() => onUpdate({ sun_brightness: v }))} />
      <Brightness label="🌙 Mond in der Nacht" value={light.moon_brightness} min={0} onSave={(v) => void run(() => onUpdate({ moon_brightness: v }))} />
      <small className="hint">Mond auf „aus“ = nachts ganz dunkel. Zum Einstellen unten eine Vorschau starten – das Licht übernimmt Änderungen nach spätestens 20 Sekunden.</small>

      <h3>Vorschau am Licht (1 Minute)</h3>
      <div className="wake-preview">
        {(['moon', 'dawn', 'sun', 'off'] as Phase[]).map((p) => (
          <button key={p} type="button" className={`button small ${light.test?.show === p ? 'primary' : ''}`} onClick={() => void run(() => onTest(p))}>{PHASE_LABEL[p]}</button>
        ))}
        {light.test && <button type="button" className="button small" onClick={() => void run(() => onTest(null))}>Vorschau beenden</button>}
      </div>

      <details className="wake-more">
        <summary>Gerät</summary>
        <label>Name<input defaultValue={light.name} maxLength={50} onBlur={(e) => e.target.value.trim() && e.target.value !== light.name && void run(() => onUpdate({ name: e.target.value }))} /></label>
        <label>Für
          <select value={light.member_id ?? ''} onChange={(e) => void run(() => onUpdate({ member_id: e.target.value ? Number(e.target.value) : null }))}>
            <option value="">–</option>
            {family.members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </label>
        <p className="muted">Gerätecode: <code>{light.token}</code>{light.firmware && <> · Firmware {light.firmware}</>}</p>
        <div className="form-actions">
          <Link to={`/schlaflicht/${light.id}/einrichten`} className="button">Per USB einrichten</Link>
          <span className="spacer" />
          <button type="button" className="button danger" onClick={() => confirm(`„${light.name}“ wirklich löschen?`) && void run(onRemove)}>Löschen</button>
        </div>
      </details>
      {error && <p className="error">{error}</p>}
    </section>
  );
}

/** Schlaflicht / Aufsteh-Ampel: Zeiten und Helligkeit (nur Eltern) */
export function SleepLightPage() {
  const { family } = useFamily();
  const lights = useWakeLights();
  const [name, setName] = useState('');
  const [memberId, setMemberId] = useState('');
  const { busy, error, run } = useAsync();

  return (
    <div className="page narrow">
      <header className="page-header"><h1>🌙 Schlaflicht</h1></header>
      <p className="muted">Zeigt ohne Uhr, ob noch geschlafen wird: 🌙 Mond in der Nacht, 🌅 die Sonne geht langsam auf, ☀️ Sonne – aufstehen!</p>
      {lights.lights === null && <p className="muted">Lade …</p>}
      {lights.lights?.length === 0 && <EmptyState icon="sun" title="Noch kein Schlaflicht angelegt" />}
      {lights.lights?.map((l) => (
        <LightCard key={l.id} light={l}
          onUpdate={(body) => lights.update(l.id, body)}
          onTest={(show) => lights.test(l.id, show)}
          onRemove={() => lights.remove(l.id)} />
      ))}
      <form className="card form" onSubmit={(e) => {
        e.preventDefault();
        void run(async () => {
          await lights.create(name.trim() || 'Schlaflicht', memberId ? Number(memberId) : null);
          setName('');
        });
      }}>
        <h2>Neues Schlaflicht</h2>
        <div className="row align-end">
          <label>Name<input value={name} onChange={(e) => setName(e.target.value)} placeholder="z. B. Kinderzimmer" maxLength={50} /></label>
          <label>Für
            <select value={memberId} onChange={(e) => setMemberId(e.target.value)}>
              <option value="">–</option>
              {family.members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </label>
          <button className="button primary" disabled={busy}>Anlegen</button>
        </div>
        {error && <p className="error">{error}</p>}
      </form>
    </div>
  );
}

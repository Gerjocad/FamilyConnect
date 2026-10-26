import { useState } from 'react';
import { api } from '../api';
import { Avatar } from '../components/Avatar';
import { EmptyState } from '../components/EmptyState';
import { Icon } from '../components/Icon';
import { Modal } from '../components/Modal';
import { useAsync } from '../components/useAsync';
import { formatShortDay } from '../dates';
import { usePermissions } from '../permissions';
import { BONUS_REASONS, MINUS_REASONS, REWARD_IDEAS, usePoints, type PointsData, type PointsPerson, type Reward } from '../points';
import { useFamily } from '../session';

const when = (sql: string) => formatShortDay(new Date(`${sql.replace(' ', 'T')}Z`));
const SOURCE_ICON: Record<string, string> = { task: '✅', habit: '🔁', chore: '🧹', bonus: '⭐', reward: '🎁' };

/** Punkte & Belohnungen: Eltern verwalten, Kinder sehen ihren Stand und lösen ein */
export function PointsPage() {
  const { isManager } = usePermissions();
  const { data, base } = usePoints();
  if (!data) return <div className="page"><p className="muted">Lade …</p></div>;
  return isManager ? <ManagerView data={data} base={base} /> : <ChildView data={data} base={base} />;
}

// --- Eltern ----------------------------------------------------------------------------------

function ManagerView({ data, base }: { data: PointsData; base: string }) {
  const { member, family } = useFamily();
  const { busy, error, run } = useAsync();
  const [bonusFor, setBonusFor] = useState<{ person: PointsPerson; sign: 1 | -1 } | null>(null);
  const [showSettings, setShowSettings] = useState(!data.settings.enabled);
  const collectors = data.people.filter((p) => p.collects && member(p.user_id));
  const pending = data.redemptions.filter((r) => r.status === 'pending');
  const settings = (body: object) => run(() => api(`${base}/settings`, { method: 'PUT', body }));

  return (
    <div className="page points-page">
      <header className="page-header">
        <h1>Punkte</h1>
        {!data.settings.released && <span className="badge beta-badge">🧪 Test – nur für dich sichtbar</span>}
      </header>

      {!data.settings.enabled && (
        <section className="card points-intro">
          <h2>⭐ Punkte & Belohnungen</h2>
          <ul>
            <li><b>Punkte sammeln</b> die Kinder automatisch: erledigte Aufgabe {data.settings.task}, Gewohnheit {data.settings.habit}, Dienst {data.settings.chore} Punkte. Wieder geöffnet = Punkte weg.</li>
            <li><b>Bonus oder Abzug</b> vergebt ihr von Hand, immer mit Grund („Oma geholfen“ +10).</li>
            <li><b>Belohnungen</b> legt ihr fest (z. B. 📱 30 Min. Tablet = 20). Kinder tippen „Einlösen“, ihr bekommt eine Nachricht und sagt Ja oder Nein – erst dann werden die Punkte abgezogen.</li>
            <li>Keine Rangliste zwischen den Kindern – jedes sieht nur seinen eigenen Stand.</li>
          </ul>
          <button className="button primary" disabled={busy} onClick={() => void settings({ enabled: true })}>Punkte einschalten</button>
          <small className="hint">Solange du die Punkte nicht für die Familie freigibst, sehen die Kinder davon nichts – sie sammeln aber schon.</small>
        </section>
      )}

      {data.settings.enabled && (
        <>
          {pending.length > 0 && (
            <section className="card">
              <h2>Möchte einlösen</h2>
              <ul className="points-list">
                {pending.map((r) => {
                  const m = member(r.user_id);
                  return (
                    <li key={r.id} className="points-row">
                      {m && <Avatar member={m} size={32} />}
                      <span className="points-row-main"><strong>{r.emoji} {r.title}</strong><small className="muted">{m?.name.split(' ')[0]} · {r.cost} Punkte</small></span>
                      <button className="button small" disabled={busy} onClick={() => void run(() => api(`${base}/redemptions/${r.id}/decline`, { method: 'POST' }))}>Nein</button>
                      <button className="button small primary" disabled={busy} onClick={() => void run(() => api(`${base}/redemptions/${r.id}/approve`, { method: 'POST' }))}>Ja</button>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {collectors.length === 0 ? (
            <EmptyState icon="star" title="Niemand sammelt Punkte">
              <p className="muted">Unten bei den Einstellungen auswählen, wer Punkte sammelt.</p>
            </EmptyState>
          ) : (
            <div className="points-people">
              {collectors.map((p) => {
                const m = member(p.user_id)!;
                return (
                  <section key={p.user_id} className="card points-person">
                    <Avatar member={m} size={44} />
                    <div className="points-person-main">
                      <strong>{m.name.split(' ')[0]}</strong>
                      <span className="points-balance">⭐ {p.balance}</span>
                      <small className="muted">diese Woche +{p.week}{p.reserved ? ` · ${p.reserved} vorgemerkt` : ''}</small>
                    </div>
                    <div className="points-person-actions">
                      <button className="button small" onClick={() => setBonusFor({ person: p, sign: 1 })}><Icon name="plus" size={16} /> Bonus</button>
                      <button className="button small" onClick={() => setBonusFor({ person: p, sign: -1 })}><Icon name="minus" size={16} /> Abzug</button>
                    </div>
                  </section>
                );
              })}
            </div>
          )}

          <RewardsManager rewards={data.rewards} base={base} />
          <History data={data} base={base} canDelete />
        </>
      )}

      <section className="card">
        <button type="button" className="link-button" onClick={() => setShowSettings(!showSettings)}>
          {showSettings ? '▾' : '▸'} Einstellungen
        </button>
        {showSettings && (
          <div className="form points-settings">
            <label className="checkbox">
              <input type="checkbox" checked={data.settings.enabled} disabled={busy} onChange={(e) => void settings({ enabled: e.target.checked })} />
              Punkte sammeln (automatisch für Aufgaben, Gewohnheiten, Dienste)
            </label>
            <div className="points-amounts">
              {([['task', '✅ Aufgabe'], ['habit', '🔁 Gewohnheit'], ['chore', '🧹 Dienst']] as const).map(([key, label]) => (
                <label key={key}>
                  {label}
                  <select value={data.settings[key]} disabled={busy} onChange={(e) => void settings({ [key]: Number(e.target.value) })}>
                    {[0, 1, 2, 3, 5, 10, 15, 20].map((v) => <option key={v} value={v}>{v} Punkte</option>)}
                  </select>
                </label>
              ))}
            </div>
            <fieldset className="points-collectors">
              <legend>Wer sammelt Punkte?</legend>
              {family.members.map((m) => {
                const on = data.people.find((p) => p.user_id === m.id)?.collects ?? false;
                return (
                  <label key={m.id} className="checkbox">
                    <input
                      type="checkbox"
                      checked={on}
                      disabled={busy}
                      onChange={() => void settings({
                        collectors: data.people.filter((p) => (p.user_id === m.id ? !on : p.collects)).map((p) => p.user_id),
                      })}
                    />
                    {m.name}
                  </label>
                );
              })}
            </fieldset>
            <label className="checkbox">
              <input type="checkbox" checked={data.settings.released} disabled={busy} onChange={(e) => void settings({ released: e.target.checked })} />
              Für die ganze Familie freigeben (Kinder sehen dann „Punkte“ im Menü)
            </label>
          </div>
        )}
      </section>
      {error && <p className="error">{error}</p>}

      {bonusFor && <BonusDialog person={bonusFor.person} sign={bonusFor.sign} base={base} onClose={() => setBonusFor(null)} />}
    </div>
  );
}

function BonusDialog({ person, sign, base, onClose }: { person: PointsPerson; sign: 1 | -1; base: string; onClose(): void }) {
  const { member } = useFamily();
  const [amount, setAmount] = useState(sign > 0 ? 10 : 5);
  const [reason, setReason] = useState('');
  const { busy, error, run } = useAsync();
  const name = member(person.user_id)?.name.split(' ')[0] ?? '';
  return (
    <Modal title={sign > 0 ? `Bonus für ${name}` : `Abzug für ${name}`} onClose={onClose}>
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          void run(async () => {
            await api(`${base}/bonus`, { method: 'POST', body: { user_id: person.user_id, amount: sign * amount, reason: reason.trim() } });
            onClose();
          });
        }}
      >
        <div className="radius-chips" role="radiogroup" aria-label="Punkte">
          {[1, 2, 5, 10, 20, 50].map((v) => (
            <button key={v} type="button" role="radio" aria-checked={amount === v} className={`chip ${amount === v ? 'chip-active' : ''}`} onClick={() => setAmount(v)}>
              {sign > 0 ? '+' : '−'}{v}
            </button>
          ))}
        </div>
        <label>
          Grund
          <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} required placeholder={sign > 0 ? 'z. B. Oma geholfen' : 'z. B. Streit'} />
        </label>
        <div className="radius-chips">
          {(sign > 0 ? BONUS_REASONS : MINUS_REASONS).map((r) => (
            <button key={r} type="button" className="chip" onClick={() => setReason(r)}>{r}</button>
          ))}
        </div>
        {error && <p className="error">{error}</p>}
        <div className="form-actions">
          <button type="button" className="button" onClick={onClose}>Abbrechen</button>
          <span className="spacer" />
          <button className="button primary" disabled={busy || !reason.trim()}>{sign > 0 ? `+${amount}` : `−${amount}`} Punkte</button>
        </div>
      </form>
    </Modal>
  );
}

function RewardsManager({ rewards, base }: { rewards: Reward[]; base: string }) {
  const [title, setTitle] = useState('');
  const [emoji, setEmoji] = useState('🎁');
  const [cost, setCost] = useState(20);
  const { busy, error, run } = useAsync();
  const add = (r: Omit<Reward, 'id'>) => run(() => api(`${base}/rewards`, { method: 'POST', body: r }));
  const ideas = REWARD_IDEAS.filter((i) => !rewards.some((r) => r.title === i.title));
  return (
    <section className="card">
      <h2>Belohnungen</h2>
      {rewards.length > 0 ? (
        <ul className="points-list">
          {rewards.map((r) => (
            <li key={r.id} className="points-row">
              <span className="reward-emoji" aria-hidden>{r.emoji}</span>
              <span className="points-row-main"><strong>{r.title}</strong></span>
              <span className="badge">{r.cost} ⭐</span>
              <button className="icon-button" aria-label={`${r.title} entfernen`} disabled={busy} onClick={() => confirm(`„${r.title}“ entfernen?`) && void run(() => api(`${base}/rewards/${r.id}`, { method: 'DELETE' }))}>
                <Icon name="trash" size={18} />
              </button>
            </li>
          ))}
        </ul>
      ) : <p className="muted">Noch keine – Vorschläge antippen oder eigene anlegen.</p>}
      {ideas.length > 0 && (
        <div className="radius-chips reward-ideas">
          {ideas.map((i) => (
            <button key={i.title} type="button" className="chip" disabled={busy} onClick={() => void add(i)}>＋ {i.emoji} {i.title} · {i.cost}</button>
          ))}
        </div>
      )}
      <form
        className="row wrap reward-form"
        onSubmit={(e) => {
          e.preventDefault();
          void run(async () => {
            await api(`${base}/rewards`, { method: 'POST', body: { title: title.trim(), emoji, cost } });
            setTitle('');
          });
        }}
      >
        <input className="emoji-input" value={emoji} onChange={(e) => setEmoji(e.target.value)} aria-label="Symbol" maxLength={4} />
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Eigene Belohnung" aria-label="Belohnung" maxLength={80} />
        <input type="number" min={1} max={100000} value={cost} onChange={(e) => setCost(Number(e.target.value))} aria-label="Punkte" className="cost-input" />
        <button className="button" disabled={busy || !title.trim() || cost < 1}><Icon name="plus" size={18} /></button>
      </form>
      {error && <p className="error">{error}</p>}
    </section>
  );
}

function History({ data, base, canDelete = false }: { data: PointsData; base: string; canDelete?: boolean }) {
  const { member } = useFamily();
  const { busy, run } = useAsync();
  const [all, setAll] = useState(false);
  if (!data.history.length) return null;
  const list = all ? data.history : data.history.slice(0, 8);
  return (
    <section className="card">
      <h2>Verlauf</h2>
      <ul className="points-history">
        {list.map((h) => (
          <li key={h.id}>
            <span aria-hidden>{SOURCE_ICON[h.source] ?? '⭐'}</span>
            <span className="points-row-main">
              <span>{h.reason}</span>
              <small className="muted">{canDelete && `${member(h.user_id)?.name.split(' ')[0] ?? ''} · `}{when(h.created_at)}</small>
            </span>
            <strong className={h.amount > 0 ? 'plus' : 'minus'}>{h.amount > 0 ? `+${h.amount}` : `−${-h.amount}`}</strong>
            {canDelete && h.source === 'bonus' && (
              <button className="icon-button subtle" aria-label="Buchung löschen" disabled={busy} onClick={() => confirm('Diese Buchung löschen?') && void run(() => api(`${base}/entries/${h.id}`, { method: 'DELETE' }))}>
                <Icon name="close" size={16} />
              </button>
            )}
          </li>
        ))}
      </ul>
      {data.history.length > 8 && <button className="link-button" onClick={() => setAll(!all)}>{all ? 'Weniger' : 'Alle anzeigen'}</button>}
    </section>
  );
}

// --- Kinder ----------------------------------------------------------------------------------

function ChildView({ data, base }: { data: PointsData; base: string }) {
  const { user } = useFamily();
  const { busy, error, run } = useAsync();
  const me = data.people.find((p) => p.user_id === user.id);
  if (!data.settings.enabled || !me?.collects) {
    return (
      <div className="page">
        <EmptyState icon="star" title="Keine Punkte">
          <p className="muted">Punkte sammeln ist für dich nicht eingeschaltet.</p>
        </EmptyState>
      </div>
    );
  }
  const free = me.balance - me.reserved;
  const pending = data.redemptions.filter((r) => r.status === 'pending');
  return (
    <div className="page points-page">
      <section className="card points-hero">
        <span className="points-hero-star" aria-hidden>⭐</span>
        <span className="points-hero-number">{me.balance}</span>
        <span className="muted">Punkte · diese Woche +{me.week}</span>
        {me.reserved > 0 && <small className="muted">davon {me.reserved} für Wünsche vorgemerkt</small>}
      </section>

      {pending.length > 0 && (
        <section className="card">
          <h2>Wartet auf Ja</h2>
          <ul className="points-list">
            {pending.map((r) => (
              <li key={r.id} className="points-row">
                <span className="reward-emoji" aria-hidden>{r.emoji}</span>
                <span className="points-row-main"><strong>{r.title}</strong><small className="muted">{r.cost} Punkte</small></span>
                <button className="button small" disabled={busy} onClick={() => void run(() => api(`${base}/redemptions/${r.id}/cancel`, { method: 'POST' }))}>Zurückziehen</button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card">
        <h2>Belohnungen</h2>
        {data.rewards.length === 0 && <p className="muted">Noch keine – frag Mama oder Papa.</p>}
        <ul className="points-list">
          {data.rewards.map((r) => {
            const progress = Math.min(1, Math.max(0, free) / r.cost);
            return (
              <li key={r.id} className="points-row reward-row">
                <span className="reward-emoji" aria-hidden>{r.emoji}</span>
                <span className="points-row-main">
                  <strong>{r.title}</strong>
                  <span className="reward-progress" aria-hidden><span style={{ width: `${progress * 100}%` }} /></span>
                  <small className="muted">{free >= r.cost ? `${r.cost} Punkte – geht!` : `noch ${r.cost - free} von ${r.cost} Punkten`}</small>
                </span>
                <button
                  className="button small primary"
                  disabled={busy || free < r.cost}
                  onClick={() => confirm(`„${r.title}“ für ${r.cost} Punkte einlösen?`) && void run(() => api(`${base}/rewards/${r.id}/redeem`, { method: 'POST' }))}
                >
                  Einlösen
                </button>
              </li>
            );
          })}
        </ul>
      </section>
      {error && <p className="error">{error}</p>}
      <History data={data} base={base} />
    </div>
  );
}

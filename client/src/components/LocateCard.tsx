import { Link } from 'react-router';
import { api } from '../api';
import { useFeatures } from '../features';
import { ago, useLocateRequests } from '../locate';
import { useFamily } from '../session';
import { Avatar } from './Avatar';
import { Icon } from './Icon';
import { useAsync } from './useAsync';

/**
 * Übersicht: „📍 Wo bist du?“ – Personen antippen zum Fragen, darunter die Antworten der letzten 24 Stunden.
 * Fragen an mich stehen ganz oben (die sieht jeder, auch ohne Testfunktion – antworten muss man ja können).
 */
export function LocateCard() {
  const { family, user, member } = useFamily();
  const features = useFeatures();
  const { items, base, reload } = useLocateRequests();
  const { busy, error, run } = useAsync();
  const incoming = items.filter((r) => r.to_user === user.id && r.status === 'pending');
  const mine = items.filter((r) => r.from_user === user.id);
  // pro Person nur die neueste Abfrage
  const latest = new Map<number, (typeof mine)[number]>();
  for (const r of mine) if (!latest.has(r.to_user)) latest.set(r.to_user, r);
  if (!features.locate && incoming.length === 0) return null;

  return (
    <section className="card span-2 locate-card">
      {incoming.map((r) => (
        <Link key={r.id} to={`/standort/${r.id}`} className="locate-incoming">
          📍 <b>{member(r.from_user)?.name.split(' ')[0]}</b> fragt: Wo bist du? <span className="button small primary">Antworten</span>
        </Link>
      ))}
      {features.locate && (
        <>
          <header className="section-header">
            <h2><Icon name="pin" size={18} /> Wo bist du?</h2>
          </header>
          <div className="locate-people">
            {family.members.filter((m) => m.id !== user.id).map((m) => (
              <button
                key={m.id}
                type="button"
                className="locate-person"
                disabled={busy}
                onClick={() => void run(async () => {
                  await api(base, { method: 'POST', body: { user_id: m.id } });
                  await reload();
                })}
              >
                <Avatar member={m} size={40} />
                <span>{m.name.split(' ')[0]}</span>
              </button>
            ))}
          </div>
          {latest.size > 0 && (
            <ul className="locate-answers">
              {[...latest.values()].map((r) => {
                const m = member(r.to_user);
                return (
                  <li key={r.id}>
                    <Link to={`/standort/${r.id}`}>
                      <strong>{m?.name.split(' ')[0]}</strong>{' '}
                      {r.status === 'pending' && <span className="muted">wartet auf Antwort … ({ago(r.created_at)})</span>}
                      {r.status === 'declined' && <span className="muted">gerade nicht{r.message ? ` · „${r.message}“` : ''}</span>}
                      {r.status === 'answered' && (
                        <span>
                          {r.place ? <>bei {r.place.icon} {r.place.name}</> : r.lat !== null ? '📍 Standort' : ''}
                          {r.message && <> · „{r.message}“</>}
                          <span className="muted"> · {ago(r.answered_at ?? r.created_at)}</span>
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
          <small className="hint">Antippen fragt per Nachricht – die Person entscheidet selbst, ob sie ihren Standort schickt.</small>
        </>
      )}
      {error && <p className="error">{error}</p>}
    </section>
  );
}

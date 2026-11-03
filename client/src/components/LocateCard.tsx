import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { api } from '../api';
import { Geofence } from '../geofence';
import { ago, useLocateRequests } from '../locate';
import { LocateAuto, answersAutomatically, autoAskers, canAnswerAutomatically } from '../locateAuto';
import { useFamily } from '../session';
import { Avatar } from './Avatar';
import { Icon } from './Icon';
import { useAsync } from './useAsync';

/**
 * Übersicht: „📍 Wo bist du?“ – Personen antippen zum Fragen, darunter die Antworten der letzten 24 Stunden.
 * Fragen an mich stehen ganz oben.
 */
export function LocateCard() {
  const { family, user, member } = useFamily();
  const { items, base, reload } = useLocateRequests();
  const { busy, error, run } = useAsync();
  const incoming = items.filter((r) => r.to_user === user.id && r.status === 'pending');
  const mine = items.filter((r) => r.from_user === user.id);
  // pro Person nur die neueste Abfrage
  const latest = new Map<number, (typeof mine)[number]>();
  for (const r of mine) if (!latest.has(r.to_user)) latest.set(r.to_user, r);
  const me = member(user.id);
  // Wer bekommt meinen Standort automatisch? Dann sollte das Handy „Immer erlauben“ haben
  const askers = me ? autoAskers(me, family.members) : [];
  const [background, setBackground] = useState<boolean | null>(null);
  useEffect(() => {
    if (askers.length && canAnswerAutomatically()) void LocateAuto.status().then((s) => setBackground(s.background), () => undefined);
  }, [askers.length]);
  const allowAlways = () => void run(async () => {
    await Geofence.requestForeground();
    setBackground((await Geofence.requestBackground()).background);
  });
  return (
    <section className="card span-2 locate-card">
      {incoming.map((r) => (
        <Link key={r.id} to={`/standort/${r.id}`} className="locate-incoming">
          📍 <b>{member(r.from_user)?.name.split(' ')[0]}</b> fragt: Wo bist du? <span className="button small primary">Antworten</span>
        </Link>
      ))}
      <header className="section-header">
        <h2><Icon name="pin" size={18} /> Wo bist du?</h2>
      </header>
      <div className="locate-people">
        {family.members.filter((m) => m.id !== user.id).map((m) => (
          <button
            key={m.id}
            type="button"
            title={me && answersAutomatically(me.role, m.role) ? 'antwortet automatisch' : undefined}
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
                  {r.status === 'pending' && <span className="muted">{r.auto ? 'Standort wird automatisch abgefragt …' : 'wartet auf Antwort …'} ({ago(r.created_at)})</span>}
                  {r.status === 'declined' && <span className="muted">gerade nicht{r.message ? ` · „${r.message}“` : ''}</span>}
                  {r.status === 'answered' && (
                    <span>
                      📍 {r.place && <>{r.place.icon} {r.place.name} · </>}{r.address ?? 'Standort'}
                      {r.message && <> · „{r.message}“</>}
                      <span className="muted"> · {r.auto && 'automatisch · '}{ago(r.answered_at ?? r.created_at)}</span>
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      <small className="hint">
        Antippen fragt per Nachricht – die Person entscheidet selbst, ob sie ihren Standort schickt.
        {me?.role === 'admin' && ' Als Admin bekommst du den Standort automatisch, wenn das Handy der Person es erlaubt.'}
        {me?.role === 'parent' && ' Bei Kindern antwortet das Handy automatisch, wenn es erlaubt ist.'}
      </small>
      {askers.length > 0 && (
        <p className="locate-auto-note">
          🔔 Wenn {askers.map((a) => a.name.split(' ')[0]).join(' oder ')} fragt, schickt dein Handy den Standort von selbst – du bekommst dann eine Nachricht.
          {canAnswerAutomatically() && background === false && (
            <> Dafür braucht die App den Standort <b>„Immer erlauben“</b>. <button type="button" className="link-button" disabled={busy} onClick={allowAlways}>Jetzt erlauben</button></>
          )}
          {!canAnswerAutomatically() && ' (klappt nur in der Android-App – sonst kommt die normale Frage)'}
        </p>
      )}
      {error && <p className="error">{error}</p>}
    </section>
  );
}

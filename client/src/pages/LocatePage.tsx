import { Suspense, lazy, useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { api } from '../api';
import { useAsync } from '../components/useAsync';
import { onLiveChange } from '../live';
import { QUICK_ANSWERS, ago, currentPosition, mapsLink, type LocateRequest } from '../locate';
import { useFamily } from '../session';

const LazyMap = lazy(() => import('../components/PlaceMap').then((m) => ({ default: m.PlaceMap })));

/** Eine „Wo bist du?“-Abfrage: Gefragte antworten hier, Fragende sehen hier die Antwort mit Karte */
export function LocatePage() {
  const { id } = useParams();
  const { family, user, member } = useFamily();
  const url = `/families/${family.id}/locate/${id}`;
  const [request, setRequest] = useState<LocateRequest | null>(null);
  const [message, setMessage] = useState('');
  const { busy, error, run } = useAsync();
  const load = useCallback(() => run(async () => setRequest(await api<LocateRequest>(url))), [url]);
  useEffect(() => {
    void load();
    return onLiveChange((resource) => resource === 'locate' && void api<LocateRequest>(url).then(setRequest, () => undefined));
  }, [load, url]);

  if (!request) return <div className="page">{error ? <p className="error">{error}</p> : <p className="muted">Lade …</p>}</div>;
  const asker = member(request.from_user)?.name.split(' ')[0] ?? 'Jemand';
  const asked = member(request.to_user)?.name.split(' ')[0] ?? 'Jemand';
  const answer = (body: object) => run(async () => setRequest(await api<LocateRequest>(`${url}/answer`, { method: 'POST', body })));

  // --- Ich wurde gefragt und habe noch nicht geantwortet ---------------------------------
  if (request.to_user === user.id && request.status === 'pending') {
    return (
      <div className="page locate-page">
        <section className="card locate-question">
          <h1>📍 {asker} fragt: Wo bist du?</h1>
          <p className="muted">Gefragt {ago(request.created_at)}. Dein Standort geht nur an {asker} und wird nach 24 Stunden gelöscht.</p>
          <button
            className="button primary big"
            disabled={busy}
            onClick={() => void run(async () => {
              const pos = await currentPosition();
              setRequest(await api<LocateRequest>(`${url}/answer`, {
                method: 'POST',
                body: { lat: pos.coords.latitude, lon: pos.coords.longitude, accuracy: pos.coords.accuracy, message: message.trim() || undefined },
              }));
            })}
          >
            {busy ? 'Suche Standort …' : '📍 Standort senden'}
          </button>
          <div className="locate-or">oder nur kurz antworten:</div>
          <div className="radius-chips">
            {QUICK_ANSWERS.map((q) => (
              <button key={q} type="button" className={`chip ${message === q ? 'chip-active' : ''}`} onClick={() => setMessage(q)}>{q}</button>
            ))}
          </div>
          <div className="row">
            <input value={message} onChange={(e) => setMessage(e.target.value)} maxLength={120} placeholder="Eigene Antwort" aria-label="Antwort" />
            <button className="button" disabled={busy || !message.trim()} onClick={() => void answer({ message: message.trim() })}>Nur Text</button>
          </div>
          <button className="link-button" disabled={busy} onClick={() => void answer({ declined: true, message: message.trim() || undefined })}>Nicht jetzt</button>
          {error && <p className="error">{error}</p>}
        </section>
      </div>
    );
  }

  // --- Antwort ansehen (Fragende) bzw. eigene Antwort (Gefragte) -------------------------------
  const mine = request.to_user === user.id;
  return (
    <div className="page locate-page">
      <section className="card">
        <h1>📍 {mine ? `Deine Antwort an ${asker}` : `Wo ist ${asked}?`}</h1>
        {request.status === 'pending' && <p className="muted">Warte auf Antwort … (gefragt {ago(request.created_at)}) – du bekommst eine Nachricht.</p>}
        {request.status === 'declined' && <p>{mine ? 'Du hast „Nicht jetzt“ geantwortet.' : `${asked} möchte gerade nicht.`}{request.message && <> „{request.message}“</>}</p>}
        {request.status === 'answered' && (
          <>
            <p className="locate-result">
              {request.place && <b>bei {request.place.icon} {request.place.name}</b>}
              {request.message && <> „{request.message}“</>}
              <span className="muted"> · {ago(request.answered_at ?? request.created_at)}{request.accuracy !== null && ` · genau auf ca. ${request.accuracy} m`}</span>
            </p>
            {request.lat !== null && request.lon !== null && (
              <>
                <Suspense fallback={<div className="place-map-placeholder" />}>
                  <LazyMap
                    places={[{ lat: request.lat, lon: request.lon, radius: Math.max(request.accuracy ?? 30, 15), icon: '📍', name: asked }]}
                    center={[request.lat, request.lon]}
                    height={280}
                  />
                </Suspense>
                <a className="button" href={mapsLink(request)} target="_blank" rel="noopener noreferrer">In Google Maps öffnen</a>
              </>
            )}
          </>
        )}
        <Link to="/" className="link-button">Zur Übersicht</Link>
      </section>
    </div>
  );
}

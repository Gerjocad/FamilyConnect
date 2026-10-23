import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import { api } from '../api';
import { useFamily } from '../session';

interface Result { device: string; card: { id: number; name: string; image: string | null }; family_id: number }

/** Ziel eines Musik-Aufklebers (familyconnect://h/m/<token>): Playlist sofort auf dem Lautsprecher starten */
export function MusicPlayPage() {
  const { token } = useParams();
  const { family, selectFamily } = useFamily();
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  const start = () => {
    setError(null);
    api<Result>(`/music/by-token/${token}/play`, { method: 'POST' })
      .then((res) => {
        setResult(res);
        if (res.family_id !== family.id) selectFamily(res.family_id);
      })
      .catch((err: Error) => setError(err.message));
  };
  useEffect(() => {
    // nur einmal starten, auch wenn React die Seite doppelt aufbaut
    if (started.current) return;
    started.current = true;
    start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  return (
    <div className="page narrow">
      <section className="card checkin-card">
        {result ? (
          <>
            {result.card.image ? <img src={result.card.image} alt="" className="music-play-cover" /> : <span className="checkin-icon">🎵</span>}
            <h1>{result.card.name}</h1>
            <p className="muted">läuft jetzt auf <b>{result.device}</b></p>
          </>
        ) : error ? (
          <>
            <span className="checkin-icon error-icon">!</span>
            <p className="error">{error}</p>
            <button className="button primary" onClick={start}>Nochmal versuchen</button>
          </>
        ) : (
          <>
            <span className="checkin-icon neutral">🎵</span>
            <p className="muted">Starte Musik …</p>
          </>
        )}
        <Link to="/musik" className="button">Zur Musik</Link>
      </section>
    </div>
  );
}

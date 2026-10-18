import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import { api } from '../api';
import { toDateKey } from '../dates';
import { useFamily } from '../session';
import type { Checkin } from '../types';

interface Result {
  checkin: Checkin;
  already: boolean;
  habit: { id: number; title: string; emoji: string; family_id: number };
}

/** Ziel eines NFC-Aufklebers: hakt die Gewohnheit sofort für die angemeldete Person ab */
export function HabitCheckinPage() {
  const { token } = useParams();
  const { user, family, selectFamily } = useFamily();
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [undone, setUndone] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    // Nur einmal abhaken, auch wenn React die Seite doppelt aufbaut
    if (started.current) return;
    started.current = true;
    api<Result>(`/habits/by-token/${token}/checkin`, { method: 'POST', body: { date: toDateKey(new Date()) } })
      .then((res) => {
        setResult(res);
        // Aufkleber gehört zu einer anderen eigenen Familie/Gruppe → dorthin wechseln
        if (res.habit.family_id !== family.id) selectFamily(res.habit.family_id);
      })
      .catch((err: Error) => setError(err.message));
  }, [token, family.id, selectFamily]);

  const undo = async () => {
    if (!result) return;
    const { checkin, habit } = result;
    await api(`/families/${habit.family_id}/habits/${habit.id}/checkins`, { method: 'DELETE', body: { date: checkin.date } });
    setUndone(true);
  };

  return (
    <div className="page narrow">
      <div className="card checkin-card">
        {error ? (
          <>
            <span className="checkin-icon error-icon">!</span>
            <h1>Das hat nicht geklappt</h1>
            <p className="muted">{error}</p>
          </>
        ) : !result ? (
          <p className="muted">Wird abgehakt …</p>
        ) : undone ? (
          <>
            <span className="checkin-icon neutral">↩</span>
            <h1>Zurückgenommen</h1>
            <p className="muted">{result.habit.title} ist für heute wieder offen.</p>
          </>
        ) : (
          <>
            <span className="checkin-icon">{result.habit.emoji || '✓'}</span>
            <h1>{result.habit.title} erledigt!</h1>
            <p className="muted">
              {result.already ? 'War heute schon abgehakt' : `Abgehakt für ${user.name.split(' ')[0]}`} ✓
            </p>
            {!result.already && <button className="link-button" onClick={() => void undo()}>Rückgängig</button>}
          </>
        )}
        <Link to="/gewohnheiten" className="button primary">Zu den Gewohnheiten</Link>
      </div>
    </div>
  );
}

import { useState, type FormEvent } from 'react';
import { api } from '../api';
import { useFamily } from '../session';
import type { Family } from '../types';
import { Icon } from './Icon';
import { useAsync } from './useAsync';

interface Place { name: string; region: string; country: string; lat: number; lon: number }

/** Einstellungen: Ort für das Wetter auf der Übersicht suchen und speichern (nur Admins) */
export function WeatherPlace({ onSaved }: { onSaved(family: Family): void }) {
  const { family } = useFamily();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Place[] | null>(null);
  const { busy, error, run } = useAsync();

  const search = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => setResults(await api<Place[]>(`/families/${family.id}/weather/places?q=${encodeURIComponent(query.trim())}`)));
  };
  const save = (weather: { name: string; lat: number; lon: number } | null) =>
    void run(async () => {
      onSaved(await api<Family>(`/families/${family.id}`, { method: 'PATCH', body: { weather } }));
      setResults(null);
      setQuery('');
    });

  return (
    <div className="field weather-place">
      <span>Ort fürs Wetter <span className="hint">(Vorhersage auf der Übersicht)</span></span>
      {family.weather_place && (
        <p className="weather-place-current">
          📍 <strong>{family.weather_place}</strong>
          <button type="button" className="link-button danger-link" disabled={busy} onClick={() => save(null)}>Entfernen</button>
        </p>
      )}
      <form className="row align-end" onSubmit={search}>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={family.weather_place ? 'Anderen Ort suchen …' : 'Stadt oder PLZ-Ort, z. B. Köln'} aria-label="Ort suchen" minLength={2} required />
        <button className="button" disabled={busy}><Icon name="search" size={18} /> Suchen</button>
      </form>
      {results && (
        results.length === 0 ? <p className="muted">Kein Ort gefunden</p> : (
          <ul className="place-results">
            {results.map((p) => (
              <li key={`${p.lat},${p.lon}`}>
                <button type="button" className="link-button" onClick={() => save({ name: p.name, lat: p.lat, lon: p.lon })}>
                  {p.name} <small className="muted">{[p.region, p.country].filter(Boolean).join(', ')}</small>
                </button>
              </li>
            ))}
          </ul>
        )
      )}
      {error && <p className="error">{error}</p>}
    </div>
  );
}

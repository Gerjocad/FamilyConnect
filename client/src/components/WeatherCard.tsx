import { addDays, formatShortDay, occurrencesInRange, startOfDay } from '../dates';
import type { CalendarEvent } from '../types';
import { describeWeather, useWeather, weatherHints } from '../weather';

/** Übersicht: Wetter heute und morgen mit Hinweisen passend zu den Terminen */
export function WeatherCard({ events }: { events: CalendarEvent[] }) {
  const weather = useWeather();
  if (!weather?.place || !weather.days?.length) return null;
  const now = new Date();
  const today = startOfDay(now);
  const hints = weatherHints(weather, now, occurrencesInRange(events, today, addDays(today, 1)));
  const current = describeWeather(weather.current?.code);
  const [day, tomorrow] = weather.days;

  return (
    <section className="card span-2 weather-card" aria-label={`Wetter in ${weather.place}`}>
      <div className="weather-now">
        <span className="weather-icon" aria-hidden>{current.icon}</span>
        <span>
          <strong className="weather-temp">{weather.current?.temp ?? day.max}°</strong>
          <small className="muted">{current.label} · {weather.place}</small>
        </span>
        <span className="spacer" />
        <span className="weather-days">
          <span title="Heute">Heute <b>{day.max}°</b> / {day.min}°{day.rain >= 30 && <small> 💧{day.rain}%</small>}</span>
          {tomorrow && (
            <span title={formatShortDay(addDays(today, 1))}>
              Morgen {describeWeather(tomorrow.code).icon} <b>{tomorrow.max}°</b> / {tomorrow.min}°
            </span>
          )}
        </span>
      </div>
      {hints.length > 0 && (
        <ul className="weather-hints">
          {hints.map((h) => <li key={h}>{h}</li>)}
        </ul>
      )}
    </section>
  );
}

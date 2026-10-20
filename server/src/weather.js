// Wetter für die Übersicht von open-meteo.com (kostenlos, ohne Schlüssel).
// Ort wählt der Admin in den Einstellungen (Ortssuche über die Geocoding-API von Open-Meteo).
import { Router } from 'express';

const FORECAST = 'https://api.open-meteo.com/v1/forecast';
const GEOCODING = 'https://geocoding-api.open-meteo.com/v1/search';
const CACHE_MS = 30 * 60 * 1000;

export class WeatherService {
  #fetch;
  #cache = new Map();

  constructor({ fetchImpl = fetch } = {}) {
    this.#fetch = fetchImpl;
  }

  async #json(url) {
    const res = await this.#fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`Open-Meteo antwortet mit ${res.status}`);
    return res.json();
  }

  /** Orte zum Suchbegriff: [{ name, region, country, lat, lon }] */
  async places(query) {
    const data = await this.#json(`${GEOCODING}?name=${encodeURIComponent(query)}&count=6&language=de&format=json`);
    return (data.results ?? []).map((r) => ({
      name: r.name,
      region: r.admin1 ?? '',
      country: r.country ?? '',
      lat: Math.round(r.latitude * 1000) / 1000,
      lon: Math.round(r.longitude * 1000) / 1000,
    }));
  }

  /**
   * Heute und morgen: { current: { temp, code }, days: [{ date, code, max, min, rain }], hours: [{ time, temp, rain, code }] }
   * Zeiten in deutscher Ortszeit ohne Zone (wie die Termine)
   */
  async forecast(lat, lon) {
    const key = `${lat},${lon}`;
    const cached = this.#cache.get(key);
    if (cached && Date.now() - cached.at < CACHE_MS) return cached.data;
    try {
      const d = await this.#json(
        `${FORECAST}?latitude=${lat}&longitude=${lon}&timezone=Europe%2FBerlin&forecast_days=2`
        + '&current=temperature_2m,weather_code'
        + '&hourly=temperature_2m,precipitation_probability,weather_code'
        + '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max',
      );
      const round = (n) => (typeof n === 'number' ? Math.round(n) : null);
      const data = {
        current: { temp: round(d.current?.temperature_2m), code: d.current?.weather_code ?? null },
        days: (d.daily?.time ?? []).map((date, i) => ({
          date,
          code: d.daily.weather_code[i],
          max: round(d.daily.temperature_2m_max[i]),
          min: round(d.daily.temperature_2m_min[i]),
          rain: d.daily.precipitation_probability_max[i] ?? 0,
        })),
        hours: (d.hourly?.time ?? []).map((time, i) => ({
          time,
          temp: round(d.hourly.temperature_2m[i]),
          rain: d.hourly.precipitation_probability[i] ?? 0,
          code: d.hourly.weather_code[i],
        })),
      };
      this.#cache.set(key, { at: Date.now(), data });
      return data;
    } catch (err) {
      console.error('Wetter nicht abrufbar:', err.message);
      if (cached) return cached.data;
      throw err;
    }
  }
}

export function weatherRouter(db, { auth, member, weather }) {
  const router = Router();
  const base = '/api/families/:familyId/weather';

  router.get(base, auth, member, async (req, res) => {
    const f = db.prepare('SELECT weather_place, weather_lat, weather_lon FROM families WHERE id = ?').get(req.familyId);
    if (f.weather_lat === null || f.weather_lon === null) return res.json({ place: null });
    try {
      res.json({ place: f.weather_place, ...(await weather.forecast(f.weather_lat, f.weather_lon)) });
    } catch {
      res.status(502).json({ error: 'Wetter gerade nicht abrufbar' });
    }
  });

  router.get(`${base}/places`, auth, member, async (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 80) : '';
    if (q.length < 2) return res.json([]);
    try {
      res.json(await weather.places(q));
    } catch {
      res.status(502).json({ error: 'Ortssuche gerade nicht erreichbar' });
    }
  });

  return router;
}

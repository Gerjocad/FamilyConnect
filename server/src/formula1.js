// Formel-1-Rennkalender (Jolpica, Nachfolger der Ergast-API; kostenlos, ohne Schlüssel).
// Die Familie schaltet ihn in den Einstellungen ein; im Kalender erscheinen dann die Rennsonntage mit Startzeit.
import { localKey, localStamp } from './occurrences.js';

const API = 'https://api.jolpi.ca/ergast/f1';
const CACHE_MS = 12 * 3600_000;

// „Australian Grand Prix“ → „GP Australien“
const NAMES = {
  Australian: 'Australien', Chinese: 'China', Japanese: 'Japan', Bahrain: 'Bahrain', 'Saudi Arabian': 'Saudi-Arabien',
  Miami: 'Miami', Canadian: 'Kanada', Monaco: 'Monaco', Spanish: 'Spanien', 'Barcelona-Catalunya': 'Barcelona',
  Austrian: 'Österreich', British: 'Großbritannien', Belgian: 'Belgien', Hungarian: 'Ungarn', Dutch: 'Niederlande',
  Italian: 'Italien', 'Emilia Romagna': 'Emilia-Romagna', Azerbaijan: 'Aserbaidschan', Singapore: 'Singapur',
  'United States': 'USA', 'Mexico City': 'Mexiko', 'São Paulo': 'Brasilien', Brazilian: 'Brasilien', 'Las Vegas': 'Las Vegas',
  Qatar: 'Katar', 'Abu Dhabi': 'Abu Dhabi', French: 'Frankreich', Portuguese: 'Portugal', Turkish: 'Türkei', German: 'Deutschland',
};
const FLAGS = {
  Australia: '🇦🇺', China: '🇨🇳', Japan: '🇯🇵', Bahrain: '🇧🇭', 'Saudi Arabia': '🇸🇦', USA: '🇺🇸', 'United States': '🇺🇸',
  Canada: '🇨🇦', Monaco: '🇲🇨', Spain: '🇪🇸', Austria: '🇦🇹', UK: '🇬🇧', 'United Kingdom': '🇬🇧', Belgium: '🇧🇪',
  Hungary: '🇭🇺', Netherlands: '🇳🇱', Italy: '🇮🇹', Azerbaijan: '🇦🇿', Singapore: '🇸🇬', Mexico: '🇲🇽', Brazil: '🇧🇷',
  Qatar: '🇶🇦', UAE: '🇦🇪', Malaysia: '🇲🇾', Vietnam: '🇻🇳', 'South Africa': '🇿🇦', Argentina: '🇦🇷', Thailand: '🇹🇭',
  Korea: '🇰🇷', India: '🇮🇳', Russia: '🇷🇺', France: '🇫🇷', Portugal: '🇵🇹', Turkey: '🇹🇷', Germany: '🇩🇪',
};

export function germanRaceName(raceName) {
  // auch Sonderfälle wie „Bahrain Grand Prix in Malaysia“
  const base = raceName.replace(/\s*Grand Prix\s*/i, ' ').replace(/\s+/g, ' ').trim();
  return `GP ${NAMES[base] ?? base}`;
}

/** Datum/Uhrzeit (UTC) aus der API → Ortszeit des Servers (= Zeitzone der Familie) */
const local = (s) => {
  if (!s?.date) return null;
  const d = new Date(`${s.date}T${s.time ?? '12:00:00Z'}`);
  return { date: localKey(d), time: s.time ? localStamp(d).slice(11, 16) : null };
};

export class Formula1Service {
  #fetch;
  #cache = new Map();

  constructor({ fetchImpl = fetch } = {}) {
    this.#fetch = fetchImpl;
  }

  /** Rennen einer Saison: [{ round, name, flag, date, time, circuit, locality, sprint, qualifying }] */
  async season(year) {
    const hit = this.#cache.get(year);
    if (hit && Date.now() - hit.at < CACHE_MS) return hit.races;
    const res = await this.#fetch(`${API}/${year}.json`, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`Formel-1-Kalender antwortet mit ${res.status}`);
    const data = await res.json();
    const races = (data.MRData?.RaceTable?.Races ?? []).map((r) => {
      const race = local(r);
      return {
        round: Number(r.round),
        name: germanRaceName(r.raceName),
        flag: FLAGS[r.Circuit?.Location?.country] ?? '🏁',
        date: race.date,
        time: race.time,
        circuit: r.Circuit?.circuitName ?? '',
        locality: r.Circuit?.Location?.locality ?? '',
        sprint: Boolean(r.Sprint),
        qualifying: local(r.Qualifying),
      };
    });
    this.#cache.set(year, { at: Date.now(), races });
    return races;
  }
}

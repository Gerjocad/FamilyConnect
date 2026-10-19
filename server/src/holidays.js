// Feiertage und Schulferien je Bundesland von openholidaysapi.org (kostenlos, ohne Schlüssel).
// Ergebnisse werden einen Tag zwischengespeichert; bei Ausfall bleibt der letzte Stand.

export const STATES = {
  BW: 'Baden-Württemberg', BY: 'Bayern', BE: 'Berlin', BB: 'Brandenburg', HB: 'Bremen', HH: 'Hamburg',
  HE: 'Hessen', MV: 'Mecklenburg-Vorpommern', NI: 'Niedersachsen', NW: 'Nordrhein-Westfalen', RP: 'Rheinland-Pfalz',
  SL: 'Saarland', SN: 'Sachsen', ST: 'Sachsen-Anhalt', SH: 'Schleswig-Holstein', TH: 'Thüringen',
};

const CACHE_MS = 24 * 60 * 60 * 1000;
const API = 'https://openholidaysapi.org';

const germanName = (names) => names?.find((n) => n.language === 'DE')?.text ?? names?.[0]?.text ?? '';

export class HolidayService {
  #fetch;
  #cache = new Map();

  constructor({ fetchImpl = fetch } = {}) {
    this.#fetch = fetchImpl;
  }

  async #get(kind, state, year) {
    const url = `${API}/${kind}?countryIsoCode=DE&subdivisionCode=DE-${state}&validFrom=${year}-01-01&validTo=${year}-12-31&languageIsoCode=DE`;
    const res = await this.#fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`OpenHolidays antwortet mit ${res.status}`);
    return res.json();
  }

  /** { public: [{ date, name }], school: [{ start, end, name }] } für ein Bundesland und Jahr */
  async forYear(state, year) {
    const key = `${state}:${year}`;
    const cached = this.#cache.get(key);
    if (cached && Date.now() - cached.at < CACHE_MS) return cached.data;
    try {
      const [pub, school] = await Promise.all([this.#get('PublicHolidays', state, year), this.#get('SchoolHolidays', state, year)]);
      const data = {
        // Bundesweite Feiertage haben keine Unterteilung, regionale gelten für das gewählte Land
        public: pub.map((h) => ({ date: h.startDate, name: germanName(h.name) })),
        school: school.map((h) => ({ start: h.startDate, end: h.endDate, name: germanName(h.name) })),
      };
      this.#cache.set(key, { at: Date.now(), data });
      return data;
    } catch (err) {
      console.error('Ferien/Feiertage nicht abrufbar:', err.message);
      if (cached) return cached.data;
      throw err;
    }
  }
}

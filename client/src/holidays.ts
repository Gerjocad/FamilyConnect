// Feiertage und Schulferien des Bundeslands der Familie (Server: server/src/holidays.js)
import { useEffect, useState } from 'react';
import { api } from './api';
import { useFamily } from './session';

export const STATES: Record<string, string> = {
  BW: 'Baden-Württemberg', BY: 'Bayern', BE: 'Berlin', BB: 'Brandenburg', HB: 'Bremen', HH: 'Hamburg',
  HE: 'Hessen', MV: 'Mecklenburg-Vorpommern', NI: 'Niedersachsen', NW: 'Nordrhein-Westfalen', RP: 'Rheinland-Pfalz',
  SL: 'Saarland', SN: 'Sachsen', ST: 'Sachsen-Anhalt', SH: 'Schleswig-Holstein', TH: 'Thüringen',
};

interface YearData {
  public: { date: string; name: string }[];
  school: { start: string; end: string; name: string }[];
}

// Pro Familie, Bundesland und Jahr nur einmal laden
const cache = new Map<string, Promise<YearData>>();

export interface Holidays {
  state: string | null;
  /** Feiertag an diesem Tag (JJJJ-MM-TT) */
  publicHoliday(date: string): string | null;
  /** Schulferien an diesem Tag */
  schoolHoliday(date: string): { name: string; end: string } | null;
  /** laufende oder nächste Ferien ab `date` */
  nextSchoolHoliday(date: string): { name: string; start: string; end: string } | null;
}

export function useHolidays(years: number[]): Holidays {
  const { family } = useFamily();
  const [data, setData] = useState<YearData>({ public: [], school: [] });
  const key = years.join(',');

  useEffect(() => {
    if (!family.state) return setData({ public: [], school: [] });
    let cancelled = false;
    const load = (year: number) => {
      const k = `${family.id}:${family.state}:${year}`;
      if (!cache.has(k)) {
        const request = api<YearData>(`/families/${family.id}/holidays?year=${year}`);
        request.catch(() => cache.delete(k));
        cache.set(k, request);
      }
      return cache.get(k)!.catch(() => ({ public: [], school: [] }) as YearData);
    };
    void Promise.all(key.split(',').map(Number).map(load)).then((parts) => {
      if (cancelled) return;
      // Ferien über den Jahreswechsel kommen in beiden Jahren vor
      const school = [...new Map(parts.flatMap((p) => p.school).map((s) => [`${s.start}:${s.name}`, s])).values()];
      setData({ public: parts.flatMap((p) => p.public), school: school.sort((a, b) => a.start.localeCompare(b.start)) });
    });
    return () => {
      cancelled = true;
    };
  }, [family.id, family.state, key]);

  return {
    state: family.state,
    publicHoliday: (date) => data.public.find((h) => h.date === date)?.name ?? null,
    schoolHoliday: (date) => data.school.find((s) => s.start <= date && date <= s.end) ?? null,
    nextSchoolHoliday: (date) => data.school.find((s) => s.end >= date) ?? null,
  };
}

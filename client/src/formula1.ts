// Formel-1-Rennen im Kalender (Server: server/src/formula1.js) – nur wenn die Familie es eingeschaltet hat
import { useEffect, useState } from 'react';
import { api } from './api';
import { useFamily } from './session';

export interface Race {
  round: number;
  /** z. B. „GP Mexiko“ */
  name: string;
  flag: string;
  /** Renntag in Ortszeit (JJJJ-MM-TT) */
  date: string;
  /** Start in Ortszeit (HH:MM) */
  time: string | null;
  circuit: string;
  locality: string;
  sprint: boolean;
  qualifying: { date: string; time: string | null } | null;
}

// Pro Familie und Jahr nur einmal laden
const cache = new Map<string, Promise<Race[]>>();

export function useFormula1(years: number[]) {
  const { family } = useFamily();
  const [races, setRaces] = useState<Race[]>([]);
  const key = years.join(',');

  useEffect(() => {
    if (!family.show_f1) return setRaces([]);
    let cancelled = false;
    const load = (year: number) => {
      const k = `${family.id}:${year}`;
      if (!cache.has(k)) {
        const request = api<Race[]>(`/families/${family.id}/formula1?year=${year}`);
        request.catch(() => cache.delete(k));
        cache.set(k, request);
      }
      return cache.get(k)!.catch(() => [] as Race[]);
    };
    void Promise.all(key.split(',').map(Number).map(load)).then((parts) => {
      if (!cancelled) setRaces(parts.flat());
    });
    return () => {
      cancelled = true;
    };
  }, [family.id, family.show_f1, key]);

  return {
    enabled: family.show_f1,
    raceOn: (date: string) => races.find((r) => r.date === date) ?? null,
    /** nächstes Rennen ab `date` (inklusive) */
    nextRace: (date: string) => races.filter((r) => r.date >= date).sort((a, b) => a.date.localeCompare(b.date))[0] ?? null,
  };
}

/** „🇲🇽 GP Mexiko · 21:00 Uhr“ */
export const raceLabel = (r: Race) => `${r.flag} ${r.name}${r.time ? ` · ${r.time} Uhr` : ''}`;

// Dienste mit Rotation: Termine und wer dran ist (gleiche Rechnung wie occurrenceIndex in server/src/chores.js)
import { useCallback, useEffect, useState } from 'react';
import { api } from './api';
import { addDays, parseLocal, startOfDay, toDateKey } from './dates';
import { onLiveChange } from './live';
import { useFamily } from './session';
import type { Chore, ChoreDay } from './types';
import { useResource } from './useResource';

export interface ChoreOccurrence {
  chore: Chore;
  date: string;
  index: number;
  assignee: number | null;
  swapped: boolean;
  doneBy: number | null;
}

const DAY = 86_400_000;
const utc = (key: string) => Date.parse(`${key}T00:00:00Z`);

/** Termine eines Dienstes zwischen `from` und `to` (jeweils JJJJ-MM-TT, inklusive) */
export function choreOccurrences(chore: Chore, from: string, to: string, days: ChoreDay[] = []): ChoreOccurrence[] {
  const make = (date: string, i: number): ChoreOccurrence => {
    const extra = days.find((d) => d.chore_id === chore.id && d.date === date);
    const rotation = chore.member_ids.length ? chore.member_ids[i % chore.member_ids.length] : null;
    return {
      chore, date, index: i,
      assignee: extra?.assignee_id ?? rotation,
      swapped: extra?.assignee_id != null && extra.assignee_id !== rotation,
      doneBy: extra?.done_by ?? null,
    };
  };
  // Feste Termine (Abfallkalender): Rotation über die Position in der Liste
  if (chore.dates?.length) {
    return chore.dates.map((date, i) => [date, i] as const).filter(([date]) => date >= from && date <= to).map(([date, i]) => make(date, i));
  }
  const step = chore.interval_weeks * 7;
  const start = utc(chore.start_date);
  const first = Math.max(0, Math.ceil((utc(from) - start) / DAY / step));
  const result: ChoreOccurrence[] = [];
  for (let i = first; ; i++) {
    const date = new Date(start + i * step * DAY).toISOString().slice(0, 10);
    if (date > to) break;
    result.push(make(date, i));
  }
  return result;
}

/** Alle Termine aller Dienste im Zeitraum, nach Datum sortiert */
export function allOccurrences(chores: Chore[], from: string, to: string, days: ChoreDay[]) {
  return chores.flatMap((c) => choreOccurrences(c, from, to, days)).sort((a, b) => a.date.localeCompare(b.date) || a.chore.title.localeCompare(b.chore.title));
}

const WEEKDAYS = ['sonntags', 'montags', 'dienstags', 'mittwochs', 'donnerstags', 'freitags', 'samstags'];

/** „Jeden Dienstag“, „Alle 2 Wochen dienstags“ */
export function choreRhythm(chore: Chore) {
  if (chore.dates?.length) {
    const left = chore.dates.filter((d) => d >= toDateKey(new Date())).length;
    return `Nach Abfallkalender · noch ${left} ${left === 1 ? 'Termin' : 'Termine'}`;
  }
  const weekday = WEEKDAYS[parseLocal(chore.start_date).getDay()];
  if (chore.interval_weeks === 1) return `Jeden ${weekday.slice(0, -1).replace(/^./, (c) => c.toUpperCase())}`;
  return `Alle ${chore.interval_weeks} Wochen ${weekday}`;
}

/** Dienste samt Ausnahmen der letzten Woche und künftiger Termine; lädt bei Änderungen neu */
export function useChores() {
  const { family } = useFamily();
  const chores = useResource<Chore>('chores');
  const [days, setDays] = useState<ChoreDay[]>([]);
  const since = toDateKey(addDays(startOfDay(new Date()), -14));
  const base = `/families/${family.id}`;

  const reload = useCallback(async () => {
    try {
      setDays(await api<ChoreDay[]>(`${base}/chore-days?since=${since}`));
    } catch {
      // nächster Versuch beim nächsten Live-Update
    }
  }, [base, since]);

  useEffect(() => {
    void reload();
    return onLiveChange((resource) => resource === 'chores' && void reload());
  }, [reload]);

  const dayPath = (o: ChoreOccurrence) => `${base}/chores/${o.chore.id}/days/${o.date}`;
  const setDone = async (o: ChoreOccurrence, done: boolean) => {
    await api(`${dayPath(o)}/done`, { method: done ? 'POST' : 'DELETE' });
    await reload();
  };
  const assign = async (o: ChoreOccurrence, userId: number) => {
    await api(`${dayPath(o)}/assign`, { method: 'POST', body: { user_id: userId } });
    await reload();
  };

  return { chores, days, setDone, assign, reload };
}

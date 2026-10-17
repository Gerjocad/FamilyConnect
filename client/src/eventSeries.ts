import { addDays, parseLocal, toDateKey, toDateTimeKey, type Occurrence } from './dates';
import type { CalendarEvent } from './types';

export type Scope = 'one' | 'following' | 'all';

interface EventsApi {
  create(data: Partial<CalendarEvent>): Promise<unknown>;
  update(id: number, data: Partial<CalendarEvent>): Promise<unknown>;
  remove(id: number): Promise<unknown>;
}

const isSeries = (event: CalendarEvent) => event.recurrence !== 'none';

/** Speichert Änderungen an einem Termin bzw. an einem Vorkommen einer Serie */
export async function saveEvent(
  api: EventsApi,
  data: Partial<CalendarEvent>,
  event?: CalendarEvent,
  occurrence?: Occurrence,
  scope: Scope = 'all'
) {
  if (!event) return api.create(data);
  if (!isSeries(event) || !occurrence) return api.update(event.id, data);

  if (scope === 'one') {
    // Vorkommen aus der Serie nehmen und als eigenen Termin anlegen
    await api.update(event.id, { exdates: [...event.exdates, toDateKey(occurrence.start)] });
    return api.create({ ...data, recurrence: 'none', exdates: [], until: null });
  }

  // Ganze Serie: die Verschiebung dieses Vorkommens auf den Serienbeginn übertragen
  const newStart = parseLocal(data.start!);
  const newEnd = parseLocal(data.end!);
  const shift = newStart.getTime() - occurrence.start.getTime();
  const seriesStart = new Date(parseLocal(event.start).getTime() + shift);
  const seriesEnd = new Date(seriesStart.getTime() + (newEnd.getTime() - newStart.getTime()));
  const dayShift = Math.round(shift / 86_400_000);
  return api.update(event.id, {
    ...data,
    start: toDateTimeKey(seriesStart),
    end: toDateTimeKey(seriesEnd),
    exdates: dayShift ? event.exdates.map((d) => toDateKey(addDays(parseLocal(d), dayShift))) : event.exdates,
  });
}

/** Löscht einen Termin, ein Vorkommen oder die Serie ab einem Vorkommen */
export async function deleteEvent(api: EventsApi, event: CalendarEvent, occurrence?: Occurrence, scope: Scope = 'all') {
  if (!isSeries(event) || !occurrence || scope === 'all') return api.remove(event.id);
  const occKey = toDateKey(occurrence.start);
  if (scope === 'one') return api.update(event.id, { exdates: [...event.exdates, occKey] });
  // "Dieser und alle folgenden": Serie am Vortag enden lassen
  if (occKey <= event.start.slice(0, 10)) return api.remove(event.id);
  return api.update(event.id, { until: toDateKey(addDays(occurrence.start, -1)) });
}

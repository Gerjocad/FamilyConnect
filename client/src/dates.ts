import type { CalendarEvent } from './types';

const pad = (n: number) => String(n).padStart(2, '0');

/** Lokales Datum als JJJJ-MM-TT */
export function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Lokale Zeit als JJJJ-MM-TTTHH:MM */
export function toDateTimeKey(d: Date): string {
  return `${toDateKey(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function parseLocal(value: string): Date {
  const [datePart, timePart = '00:00'] = value.split('T');
  const [y, m, d] = datePart.split('-').map(Number);
  const [hh, mm] = timePart.split(':').map(Number);
  return new Date(y, m - 1, d, hh, mm);
}

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, d.getHours(), d.getMinutes());
}

/** Montag der Woche */
export function startOfWeek(d: Date): Date {
  const day = (d.getDay() + 6) % 7;
  return startOfDay(addDays(d, -day));
}

export function sameDay(a: Date, b: Date): boolean {
  return toDateKey(a) === toDateKey(b);
}

/** 6 Wochen à 7 Tage, beginnend mit dem Montag vor dem Monatsersten */
export function monthGrid(year: number, month: number): Date[] {
  const first = startOfWeek(new Date(year, month, 1));
  return Array.from({ length: 42 }, (_, i) => addDays(first, i));
}

export const WEEKDAYS_SHORT = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

const fmt = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('de-DE', opts);
const timeFmt = fmt({ hour: '2-digit', minute: '2-digit' });
const dayFmt = fmt({ weekday: 'long', day: 'numeric', month: 'long' });
const shortDayFmt = fmt({ weekday: 'short', day: 'numeric', month: 'short' });
const monthFmt = fmt({ month: 'long', year: 'numeric' });
const dateFmt = fmt({ day: '2-digit', month: '2-digit', year: 'numeric' });
const relFmt = new Intl.RelativeTimeFormat('de-DE', { numeric: 'auto' });

export const formatTime = (d: Date) => timeFmt.format(d);
export const formatDay = (d: Date) => dayFmt.format(d);
export const formatShortDay = (d: Date) => shortDayFmt.format(d);
export const formatMonth = (d: Date) => monthFmt.format(d);
export const formatDate = (d: Date) => dateFmt.format(d);

export function formatRelativeDay(key: string): string {
  const diff = Math.round((parseLocal(key).getTime() - startOfDay(new Date()).getTime()) / 86_400_000);
  if (Math.abs(diff) <= 2) return relFmt.format(diff, 'day').replace(/^./, (c) => c.toUpperCase());
  return formatShortDay(parseLocal(key));
}

/** Zeitstempel aus SQLite (UTC, "JJJJ-MM-TT HH:MM:SS") relativ formatieren */
export function formatTimestamp(value: string): string {
  const d = new Date(`${value.replace(' ', 'T')}Z`);
  const minutes = Math.round((d.getTime() - Date.now()) / 60_000);
  if (Math.abs(minutes) < 60) return relFmt.format(minutes, 'minute');
  if (Math.abs(minutes) < 24 * 60) return relFmt.format(Math.round(minutes / 60), 'hour');
  return `${formatShortDay(d)}, ${formatTime(d)}`;
}

export interface Occurrence {
  event: CalendarEvent;
  start: Date;
  end: Date;
}

function shift(date: Date, recurrence: CalendarEvent['recurrence'], n: number): Date | null {
  switch (recurrence) {
    case 'daily':
      return addDays(date, n);
    case 'weekly':
      return addDays(date, 7 * n);
    case 'monthly':
    case 'yearly': {
      const months = recurrence === 'monthly' ? n : 12 * n;
      const target = new Date(date.getFullYear(), date.getMonth() + months, date.getDate(), date.getHours(), date.getMinutes());
      // 31. eines Monats ohne 31. Tag (oder 29.2. außerhalb von Schaltjahren) überspringen
      return target.getDate() === date.getDate() ? target : null;
    }
    default:
      return n === 0 ? date : null;
  }
}

/** Alle Vorkommen eines (ggf. wiederkehrenden) Termins, die [from, to) berühren */
export function occurrences(event: CalendarEvent, from: Date, to: Date): Occurrence[] {
  const start = parseLocal(event.start);
  const end = parseLocal(event.end);
  const duration = end.getTime() - start.getTime();
  const result: Occurrence[] = [];
  const touches = (s: Date) => s < to && new Date(s.getTime() + duration) >= from;

  if (event.recurrence === 'none') {
    if (touches(start)) result.push({ event, start, end });
    return result;
  }
  const skipped = new Set(event.exdates);

  // Grob an den Zeitraum heranspringen, um nicht ab Jahr 1 zu zählen
  const approxStep = { daily: 1, weekly: 7, monthly: 28, yearly: 365 }[event.recurrence] * 86_400_000;
  let n = Math.max(0, Math.floor((from.getTime() - duration - start.getTime()) / approxStep) - 1);
  for (let guard = 0; guard < 1000; guard++, n++) {
    const s = shift(start, event.recurrence, n);
    if (!s) continue;
    if (s >= to || (event.until && toDateKey(s) > event.until)) break;
    if (skipped.has(toDateKey(s))) continue;
    if (touches(s)) result.push({ event, start: s, end: new Date(s.getTime() + duration) });
  }
  return result;
}

export function occurrencesInRange(events: CalendarEvent[], from: Date, to: Date): Occurrence[] {
  return events
    .flatMap((e) => occurrences(e, from, to))
    .sort((a, b) => Number(b.event.all_day) - Number(a.event.all_day) || a.start.getTime() - b.start.getTime());
}

export const REMINDER_LABELS: [number | null, string][] = [
  [null, 'Keine Erinnerung'],
  [0, 'Zu Beginn'],
  [5, '5 Minuten vorher'],
  [15, '15 Minuten vorher'],
  [30, '30 Minuten vorher'],
  [60, '1 Stunde vorher'],
  [120, '2 Stunden vorher'],
  [1440, '1 Tag vorher'],
  [2880, '2 Tage vorher'],
];

/** Zeitpunkt der Erinnerung; ganztägige Termine erinnern ausgehend von 9:00 Uhr */
export function reminderTime(occ: Occurrence): Date | null {
  const minutes = occ.event.reminder_minutes;
  if (minutes == null) return null;
  const base = occ.event.all_day
    ? new Date(occ.start.getFullYear(), occ.start.getMonth(), occ.start.getDate(), 9, 0)
    : occ.start;
  return new Date(base.getTime() - minutes * 60_000);
}

export const RECURRENCE_LABELS: Record<CalendarEvent['recurrence'], string> = {
  none: 'Einmalig',
  daily: 'Täglich',
  weekly: 'Wöchentlich',
  monthly: 'Monatlich',
  yearly: 'Jährlich',
};

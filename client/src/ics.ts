// Einfacher Leser für Kalenderdateien (.ics), z. B. Abfallkalender der Entsorger:
// liefert je Bezeichnung (SUMMARY) die Tage der Termine.

export interface IcsGroup {
  title: string;
  dates: string[];
}

/** Zeilenumbrüche nach RFC 5545 auflösen (Folgezeilen beginnen mit Leerzeichen/Tab) */
const unfold = (text: string) => text.replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '');

const unescape = (value: string) => value.replace(/\\n/gi, ' ').replace(/\\([,;\\])/g, '$1').trim();

export function parseIcs(text: string): IcsGroup[] {
  const groups = new Map<string, Set<string>>();
  for (const block of unfold(text).split('BEGIN:VEVENT').slice(1)) {
    const body = block.split('END:VEVENT')[0];
    const summary = /^SUMMARY(?:;[^:]*)?:(.*)$/m.exec(body)?.[1];
    const start = /^DTSTART(?:;[^:]*)?:(\d{4})(\d{2})(\d{2})/m.exec(body);
    if (!summary || !start) continue;
    const title = unescape(summary);
    if (!groups.has(title)) groups.set(title, new Set());
    groups.get(title)!.add(`${start[1]}-${start[2]}-${start[3]}`);
  }
  return [...groups].map(([title, dates]) => ({ title, dates: [...dates].sort() })).sort((a, b) => a.title.localeCompare(b.title, 'de'));
}

/** Passendes Symbol für typische Abfallarten */
export function binEmoji(title: string) {
  const t = title.toLowerCase();
  if (/weihnacht|tannenbaum|baum/.test(t)) return '🎄';
  if (/papier|pappe|blau/.test(t)) return '📰';
  if (/bio|grün|garten|braun/.test(t)) return '🌿';
  if (/wertstoff|gelb|verpackung|plastik/.test(t)) return '♻️';
  if (/glas/.test(t)) return '🍾';
  if (/sperr/.test(t)) return '🛋️';
  if (/schadstoff|problem/.test(t)) return '⚠️';
  return '🗑️';
}

// --- Termine mit Uhrzeit (Kalender-Import, z. B. Spielplan) ----------------------

export interface IcsEvent {
  uid: string;
  title: string;
  /** lokale Zeit JJJJ-MM-TTTHH:MM */
  start: string;
  end: string;
  all_day: boolean;
  location: string;
  description: string;
  recurrence: 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly';
  until: string | null;
}

export interface IcsCalendar {
  name: string;
  events: IcsEvent[];
}

const pad = (n: number) => String(n).padStart(2, '0');
const localKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

/** Versatz einer Zeitzone zu UTC (ms) zum Zeitpunkt `utc` */
function zoneOffset(zone: string, utc: number) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: zone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).formatToParts(new Date(utc)).map((p) => [p.type, Number(p.value)])
  );
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second) - utc;
}

/** DTSTART/DTEND → Date in Gerätezeit; `date` = ganztägig (nur Datum) */
function readTime(line: RegExpExecArray | null): { at: Date; date: boolean } | null {
  if (!line) return null;
  const [, params = '', value] = line;
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?/.exec(value.trim());
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]) - 1, Number(m[3])];
  if (m[4] === undefined) return { at: new Date(y, mo, d), date: true };
  const [h, mi] = [Number(m[4]), Number(m[5])];
  if (m[7]) return { at: new Date(Date.UTC(y, mo, d, h, mi)), date: false };
  const zone = /TZID=("?)([^;:"]+)\1/.exec(params)?.[2];
  if (zone) {
    try {
      // Wanduhrzeit in der angegebenen Zone; zweimal rechnen wegen Sommer-/Winterzeit
      const wall = Date.UTC(y, mo, d, h, mi);
      let utc = wall - zoneOffset(zone, wall);
      utc = wall - zoneOffset(zone, utc);
      return { at: new Date(utc), date: false };
    } catch {
      // unbekannte Zone (z. B. Windows-Namen) → als Ortszeit lesen
    }
  }
  return { at: new Date(y, mo, d, h, mi), date: false };
}

/** DURATION wie PT1H45M oder P1D → Millisekunden */
function readDuration(value: string | undefined) {
  const m = value && /^P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?)?/.exec(value.trim());
  if (!m) return null;
  const [w, d, h, mi] = m.slice(1).map((v) => Number(v ?? 0));
  return (((w * 7 + d) * 24 + h) * 60 + mi) * 60_000;
}

const FREQ: Record<string, IcsEvent['recurrence']> = { DAILY: 'daily', WEEKLY: 'weekly', MONTHLY: 'monthly', YEARLY: 'yearly' };

export function parseIcsEvents(text: string): IcsCalendar {
  const unfolded = unfold(text);
  const name = unescape(/^X-WR-CALNAME(?:;[^:]*)?:(.*)$/m.exec(unfolded)?.[1] ?? '');
  const events: IcsEvent[] = [];
  for (const block of unfolded.split('BEGIN:VEVENT').slice(1)) {
    const body = block.split('END:VEVENT')[0];
    const prop = (key: string) => new RegExp(`^${key}(;[^:]*)?:(.*)$`, 'm').exec(body);
    const field = (key: string) => unescape(prop(key)?.[2] ?? '');
    if (/^STATUS:CANCELLED/m.test(body)) continue;
    const start = readTime(prop('DTSTART'));
    const title = field('SUMMARY');
    if (!start || !title) continue;
    let end = readTime(prop('DTEND'))?.at ?? null;
    if (!end) {
      const duration = readDuration(prop('DURATION')?.[2]);
      // ohne Ende: ganztägig ein Tag, sonst zwei Stunden (z. B. ein Spiel)
      end = new Date(start.at.getTime() + (duration ?? (start.date ? 86_400_000 : 2 * 3_600_000)));
    }
    let startKey = localKey(start.at);
    let endKey = localKey(end);
    if (start.date) {
      // DTEND ist bei ganztägigen Terminen der Folgetag
      const last = new Date(end.getFullYear(), end.getMonth(), end.getDate() - 1);
      startKey = `${startKey.slice(0, 10)}T00:00`;
      endKey = `${localKey(last < start.at ? start.at : last).slice(0, 10)}T23:59`;
    }
    if (endKey < startKey) endKey = startKey;
    const rule = prop('RRULE')?.[2] ?? '';
    const freq = FREQ[/FREQ=(\w+)/.exec(rule)?.[1] ?? ''];
    // nur einfache Wiederholungen übernehmen (ohne Intervall/Anzahl), sonst als Einzeltermin
    const simple = freq && !/INTERVAL=(?!1\b)|COUNT=|BYSETPOS/.test(rule);
    const untilMatch = /UNTIL=(\d{4})(\d{2})(\d{2})/.exec(rule);
    events.push({
      uid: field('UID') || `${title}|${startKey}`,
      title: title.slice(0, 200),
      start: startKey,
      end: endKey,
      all_day: start.date,
      location: field('LOCATION').slice(0, 300),
      description: field('DESCRIPTION').slice(0, 5000),
      recurrence: simple ? freq : 'none',
      until: simple && untilMatch ? `${untilMatch[1]}-${untilMatch[2]}-${untilMatch[3]}` : null,
    });
  }
  events.sort((a, b) => a.start.localeCompare(b.start));
  return { name, events };
}

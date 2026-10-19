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

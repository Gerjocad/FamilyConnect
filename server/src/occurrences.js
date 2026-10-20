// Vorkommen (wiederkehrender) Termine in einem Zeitraum – wie client/src/dates.ts, für das Wanddisplay.
// Termine sind lokale Zeiten ohne Zone; der Server läuft in der Zeitzone der Familie (TZ in install.sh).

const pad = (n) => String(n).padStart(2, '0');
export const localKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const localStamp = (d) => `${localKey(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

export function parseLocal(value) {
  const [datePart, timePart = '00:00'] = value.split('T');
  const [y, m, d] = datePart.split('-').map(Number);
  const [hh, mm] = timePart.split(':').map(Number);
  return new Date(y, m - 1, d, hh, mm);
}

function shift(date, recurrence, n) {
  switch (recurrence) {
    case 'daily':
      return new Date(date.getFullYear(), date.getMonth(), date.getDate() + n, date.getHours(), date.getMinutes());
    case 'weekly':
      return new Date(date.getFullYear(), date.getMonth(), date.getDate() + 7 * n, date.getHours(), date.getMinutes());
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

/** Alle Vorkommen eines Termins, die [from, to) berühren: [{ event, start, end }] (Date) */
export function occurrences(event, from, to) {
  const start = parseLocal(event.start);
  const duration = parseLocal(event.end).getTime() - start.getTime();
  const touches = (s) => s < to && new Date(s.getTime() + duration) >= from;
  if (event.recurrence === 'none') return touches(start) ? [{ event, start, end: new Date(start.getTime() + duration) }] : [];

  const skipped = new Set(event.exdates ?? []);
  const result = [];
  const approxStep = { daily: 1, weekly: 7, monthly: 28, yearly: 365 }[event.recurrence] * 86_400_000;
  let n = Math.max(0, Math.floor((from.getTime() - duration - start.getTime()) / approxStep) - 1);
  for (let guard = 0; guard < 1000; guard++, n++) {
    const s = shift(start, event.recurrence, n);
    if (!s) continue;
    if (s >= to || (event.until && localKey(s) > event.until)) break;
    if (skipped.has(localKey(s))) continue;
    if (touches(s)) result.push({ event, start: s, end: new Date(s.getTime() + duration) });
  }
  return result;
}

// Datumsrechnung auf reinen Kalenderdaten (JJJJ-MM-TT), unabhängig von Zeitzonen.

const pad = (n) => String(n).padStart(2, '0');

export function toKey(d) {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export function parseKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function todayKey(now = new Date()) {
  // Lokales Datum des Servers (dieselbe Zeitzone wie die Familie, siehe TZ in install.sh)
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** Ein Intervall weiter; Monatsenden werden gekappt (31.01. → 28./29.02.) */
export function addInterval(key, recurrence, originalDay) {
  const d = parseKey(key);
  switch (recurrence) {
    case 'daily':
      return toKey(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1)));
    case 'weekly':
      return toKey(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 7)));
    case 'monthly':
    case 'yearly': {
      const months = recurrence === 'monthly' ? 1 : 12;
      const y = d.getUTCFullYear();
      const m = d.getUTCMonth() + months;
      const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
      return toKey(new Date(Date.UTC(y, m, Math.min(originalDay ?? d.getUTCDate(), lastDay))));
    }
    default:
      throw new Error(`Unbekannte Wiederholung ${recurrence}`);
  }
}

/** Nächstes Fälligkeitsdatum nach dem Erledigen: immer nach heute, im Rhythmus der bisherigen Fälligkeit */
export function nextDueDate(dueDate, recurrence, today = todayKey()) {
  const base = dueDate ?? today;
  const day = parseKey(base).getUTCDate();
  let next = addInterval(base, recurrence, day);
  while (next <= today) next = addInterval(next, recurrence, day);
  return next;
}

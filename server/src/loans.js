// Erinnerungen an Rückgabetermine (z. B. Bücherei): am Vortag ab 17 Uhr und am Tag selbst ab 7 Uhr,
// jeweils einmal – an die Person, die es ausgeliehen hat, und an die, die es eingetragen hat.
import { todayKey } from './dates.js';

const tomorrowKey = (now) => todayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));

export function checkLoanReminders(db, push, now = new Date()) {
  const today = todayKey(now);
  const due = [];
  if (now.getHours() >= 7) due.push([today, 'heute']);
  if (now.getHours() >= 17) due.push([tomorrowKey(now), 'morgen']);
  for (const [date, when] of due) {
    const key = `${today}:${when}`;
    const rows = db.prepare('SELECT * FROM loans WHERE returned = 0 AND due_date = ? AND reminded != ?').all(date, key);
    for (const loan of rows) {
      db.prepare('UPDATE loans SET reminded = ? WHERE id = ?').run(key, loan.id);
      const targets = [...new Set([loan.member_id, loan.created_by])].filter(Boolean);
      push?.notify(targets, {
        title: `📚 ${when === 'heute' ? 'Heute' : 'Morgen'} zurückgeben`,
        body: `${loan.title}${loan.lender ? ` (${loan.lender})` : ''}`,
        path: '/ausgeliehen',
      });
    }
  }
}

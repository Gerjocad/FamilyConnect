// Erinnerungen an Rückgabetermine (z. B. Bücherei): so viele Tage vorher wie gewünscht ab 17 Uhr
// (Standard: am Vortag) und am Tag selbst ab 7 Uhr, jeweils einmal – an die Person, die es
// ausgeliehen hat, und an die, die es eingetragen hat.
import { parseKey, todayKey } from './dates.js';

const daysBetween = (from, to) => Math.round((parseKey(to) - parseKey(from)) / 86_400_000);

function when(days) {
  if (days === 1) return 'Morgen';
  if (days === 2) return 'Übermorgen';
  if (days === 7) return 'In einer Woche';
  return `In ${days} Tagen`;
}

export function checkLoanReminders(db, push, now = new Date()) {
  const today = todayKey(now);
  const loans = db.prepare("SELECT * FROM loans WHERE returned = 0 AND due_date >= ? AND due_date <= date(?, '+14 days')").all(today, today);
  for (const loan of loans) {
    const left = daysBetween(today, loan.due_date);
    const ahead = loan.remind_days ?? 1;
    let kind = null;
    if (left === 0 && now.getHours() >= 7) kind = 'heute';
    else if (left > 0 && left === ahead && now.getHours() >= 17) kind = 'vorher';
    if (!kind) continue;
    const key = `${today}:${kind}`;
    if (loan.reminded === key) continue;
    db.prepare('UPDATE loans SET reminded = ? WHERE id = ?').run(key, loan.id);
    const targets = [...new Set([loan.member_id, loan.created_by])].filter(Boolean);
    push?.notify(targets, {
      title: `📚 ${kind === 'heute' ? 'Heute' : when(left)} zurückgeben`,
      body: `${loan.title}${loan.lender ? ` (${loan.lender})` : ''}`,
      path: '/ausgeliehen',
    });
  }
}

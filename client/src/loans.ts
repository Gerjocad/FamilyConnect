// Ausgeliehenes (Server-Ressource „loans“) – Hilfen für Liste, Kalender und Übersicht
import { parseLocal, startOfDay } from './dates';
import type { Loan } from './types';

/** Tage bis zur Rückgabe (negativ = überfällig) */
export const daysUntil = (loan: Loan, today = new Date()) =>
  Math.round((parseLocal(loan.due_date).getTime() - startOfDay(today).getTime()) / 86_400_000);

export function dueLabel(days: number): string {
  if (days < -1) return `${-days} Tage überfällig`;
  if (days === -1) return 'seit gestern überfällig';
  if (days === 0) return 'heute zurückgeben';
  if (days === 1) return 'morgen zurückgeben';
  return `noch ${days} Tage`;
}

/** offene Ausleihen mit Rückgabe an diesem Tag */
export const loansDueOn = (loans: Loan[], date: string) => loans.filter((l) => !l.returned && l.due_date === date);

/** übliche Leihfrist der Büchereien */
export const DEFAULT_WEEKS = 3;

/** Auswahl „so viele Tage vorher erinnern“ */
export const REMIND_OPTIONS = [0, 1, 2, 3, 5, 7];
export const remindLabel = (days: number) => (days === 0 ? 'Nur am Tag' : days === 1 ? '1 Tag vorher' : days === 7 ? '1 Woche vorher' : `${days} Tage vorher`);

const REMIND_KEY = 'familyconnect-loan-remind';
/** zuletzt gewählte Erinnerung als Vorgabe für die nächste Ausleihe */
export function lastRemindDays(): number {
  try {
    const v = Number(localStorage.getItem(REMIND_KEY));
    return REMIND_OPTIONS.includes(v) && localStorage.getItem(REMIND_KEY) !== null ? v : 1;
  } catch {
    return 1;
  }
}
export function rememberRemindDays(days: number) {
  try {
    localStorage.setItem(REMIND_KEY, String(days));
  } catch {
    // egal
  }
}

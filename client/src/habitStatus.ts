import { addDays, parseLocal, toDateKey } from './dates';
import type { Checkin, Habit, Member } from './types';

export interface HabitStatus {
  doneToday: boolean;
  /** Tage bis zur nächsten Fälligkeit; 0 = heute fällig, negativ = überfällig */
  dueIn: number;
  /** nächstes Fälligkeitsdatum (JJJJ-MM-TT) */
  nextDue: string;
  /** wie oft in Folge rechtzeitig erledigt */
  streak: number;
  lastDate: string | null;
}

const dayDiff = (a: string, b: string) => Math.round((parseLocal(a).getTime() - parseLocal(b).getTime()) / 86_400_000);

/** Für wen gilt die Gewohnheit? */
export function habitParticipants(habit: Habit, members: Member[]): Member[] {
  return habit.member_ids.length ? members.filter((m) => habit.member_ids.includes(m.id)) : members;
}

export function habitStatus(habit: Habit, userId: number, checkins: Checkin[], today = toDateKey(new Date())): HabitStatus {
  const dates = [...new Set(checkins.filter((c) => c.habit_id === habit.id && c.user_id === userId).map((c) => c.date))]
    .filter((d) => d <= today)
    .sort()
    .reverse();
  const lastDate = dates[0] ?? null;
  const nextDue = lastDate ? toDateKey(addDays(parseLocal(lastDate), habit.interval_days)) : today;
  const dueIn = dayDiff(nextDue, today);

  // Serie: Abstände zwischen den Einträgen höchstens so groß wie das Intervall – und noch nicht abgerissen
  let streak = 0;
  if (lastDate && dueIn >= 0) {
    streak = 1;
    for (let i = 1; i < dates.length && dayDiff(dates[i - 1], dates[i]) <= habit.interval_days; i++) streak++;
  }
  return { doneToday: lastDate === today, dueIn, nextDue, streak, lastDate };
}

export function intervalLabel(days: number): string {
  if (days === 1) return 'täglich';
  if (days === 7) return 'wöchentlich';
  if (days === 14) return 'alle 2 Wochen';
  return `alle ${days} Tage`;
}

export function statusLabel(s: HabitStatus): string {
  if (s.doneToday) return 'heute erledigt';
  if (s.dueIn === 0) return s.lastDate ? 'heute fällig' : 'fällig';
  if (s.dueIn < 0) return s.dueIn === -1 ? 'seit gestern fällig' : `seit ${-s.dueIn} Tagen fällig`;
  return s.dueIn === 1 ? 'morgen wieder' : `in ${s.dueIn} Tagen wieder`;
}

export const nfcUrl = (habit: Pick<Habit, 'nfc_token'>) => `familyconnect://h/${habit.nfc_token}`;

/** Kinder haken Gewohnheiten mit Aufkleber nur per NFC ab (gleiche Regel wie in server/src/habits.js) */
export const nfcOnlyFor = (habit: Habit, isChild: boolean) => isChild && habit.nfc_linked;

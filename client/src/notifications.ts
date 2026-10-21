// Erinnerungen (lokal geplant) und Push-Benachrichtigungen (über Firebase) für die Android-App.
import { LocalNotifications } from '@capacitor/local-notifications';
import { PushNotifications } from '@capacitor/push-notifications';
import { api, isNativeApp } from './api';
import { upcomingBirthdays } from './birthdays';
import { allOccurrences } from './chores';
import {
  addDays, formatShortDay, formatTime, occurrencesInRange, parseLocal, reminderTime, startOfDay, toDateKey,
} from './dates';
import { habitStatus } from './habitStatus';
import type { CalendarEvent, Checkin, Chore, ChoreDay, Contact, Habit, Member, Task } from './types';

/** Push braucht android/app/google-services.json (erkennt vite.config.ts); ohne sie würde die App beim Registrieren abstürzen */
export const PUSH_ENABLED = import.meta.env.VITE_PUSH_ENABLED === 'true';
const PUSH_TOKEN_KEY = 'familyconnect.pushToken';
const REMINDER_CHANNEL = 'reminders';
const MAX_SCHEDULED = 60; // Android begrenzt die Anzahl geplanter Alarme pro App

type Navigate = (path: string) => void;

// Stabile ID je Erinnerung, damit Neuplanen keine Duplikate erzeugt
function notificationId(key: string): number {
  let hash = 0;
  for (const ch of key) hash = (Math.imul(hash, 31) + ch.charCodeAt(0)) | 0;
  return Math.abs(hash) % 2_000_000_000 || 1;
}

let permission: Promise<boolean> | null = null;
function ensurePermission(): Promise<boolean> {
  permission ??= (async () => {
    let status = await LocalNotifications.checkPermissions();
    if (status.display === 'prompt' || status.display === 'prompt-with-rationale') {
      status = await LocalNotifications.requestPermissions();
    }
    if (status.display !== 'granted') return false;
    await LocalNotifications.createChannel({
      id: REMINDER_CHANNEL, name: 'Erinnerungen', description: 'Termine und fällige Aufgaben', importance: 4,
    });
    return true;
  })().catch(() => false);
  return permission;
}

/** "Heute"/"Morgen" aus Sicht des Moments, in dem die Erinnerung erscheint */
function dayLabel(day: Date, shownAt: Date): string {
  const diff = Math.round((startOfDay(day).getTime() - startOfDay(shownAt).getTime()) / 86_400_000);
  if (diff === 0) return 'Heute';
  if (diff === 1) return 'Morgen';
  return formatShortDay(day);
}

interface Reminder { key: string; at: Date; title: string; body: string; path: string }

export interface HabitData {
  habits: Habit[];
  checkins: Checkin[];
  chores?: Chore[];
  choreDays?: ChoreDay[];
  members?: Member[];
  contacts?: Contact[];
}

export function buildReminders(
  events: CalendarEvent[],
  tasks: Task[],
  userId: number,
  now = new Date(),
  habitData: HabitData = { habits: [], checkins: [] }
): Reminder[] {
  const reminders: Reminder[] = [];
  const horizon = addDays(startOfDay(now), 31);

  // Termine: alle Beteiligten, bzw. alle, wenn niemand ausgewählt ist
  const mine = events.filter((e) => e.reminder_minutes != null && (e.member_ids.length === 0 || e.member_ids.includes(userId)));
  for (const occ of occurrencesInRange(mine, now, horizon)) {
    const at = reminderTime(occ);
    if (!at || at <= now) continue;
    const day = dayLabel(occ.start, at);
    const when = occ.event.all_day ? day : `${day}, ${formatTime(occ.start)} Uhr`;
    reminders.push({
      key: `event:${occ.event.id}:${occ.start.toISOString()}`,
      at,
      title: occ.event.title,
      body: [when, occ.event.location].filter(Boolean).join(' · '),
      path: '/kalender',
    });
  }

  // Eigene Aufgaben: am Fälligkeitstag um 9:00 Uhr
  for (const task of tasks) {
    if (task.done || task.assignee_id !== userId || !task.due_date) continue;
    const at = parseLocal(`${task.due_date}T09:00`);
    if (at <= now || at > horizon) continue;
    reminders.push({ key: `task:${task.id}:${task.due_date}`, at, title: 'Heute fällig', body: task.title, path: '/aufgaben' });
  }

  // Gewohnheiten: am nächsten Fälligkeitstag zur eingestellten Uhrzeit (nicht, wenn heute schon erledigt)
  const todayKey = toDateKey(now);
  for (const habit of habitData.habits) {
    if (!habit.reminder_time) continue;
    if (habit.member_ids.length && !habit.member_ids.includes(userId)) continue;
    const status = habitStatus(habit, userId, habitData.checkins, todayKey);
    let day = status.dueIn <= 0 ? todayKey : status.nextDue;
    if (status.doneToday) day = toDateKey(addDays(parseLocal(todayKey), habit.interval_days));
    let at = parseLocal(`${day}T${habit.reminder_time}`);
    // Uhrzeit heute schon vorbei und noch offen → morgen noch einmal erinnern
    if (at <= now) at = parseLocal(`${toDateKey(addDays(parseLocal(day), 1))}T${habit.reminder_time}`);
    if (at > horizon) continue;
    reminders.push({
      key: `habit:${habit.id}:${toDateKey(at)}`,
      at,
      title: `${habit.emoji ? `${habit.emoji} ` : ''}${habit.title}`,
      body: status.dueIn < 0 ? 'Ist überfällig – jetzt erledigen?' : 'Heute ist es wieder so weit',
      path: '/gewohnheiten',
    });
  }

  // Dienste (z. B. Müllabfuhr): für wen dran ist bzw. für alle, wenn niemand fest eingeteilt ist
  const choreHorizon = toDateKey(addDays(startOfDay(now), 15));
  for (const occ of allOccurrences(habitData.chores ?? [], todayKey, choreHorizon, habitData.choreDays ?? [])) {
    if (occ.chore.remind === 'none' || occ.doneBy !== null) continue;
    if (occ.assignee !== null && occ.assignee !== userId) continue;
    const evening = occ.chore.remind === 'evening';
    const at = evening ? parseLocal(`${toDateKey(addDays(parseLocal(occ.date), -1))}T19:00`) : parseLocal(`${occ.date}T07:00`);
    if (at <= now) continue;
    const when = evening ? 'Morgen' : 'Heute';
    reminders.push({
      key: `chore:${occ.chore.id}:${occ.date}`,
      at,
      title: `${occ.chore.emoji ? `${occ.chore.emoji} ` : ''}${occ.chore.title}`,
      body: occ.assignee === userId ? `${when} bist du dran${evening ? ' – bitte heute Abend erledigen' : ''}` : `${when} ist es so weit`,
      path: '/dienste',
    });
  }

  // Geburtstage: eine Woche vorher und am Tag selbst (nicht der eigene)
  for (const b of upcomingBirthdays((habitData.members ?? []).filter((m) => m.id !== userId), habitData.contacts ?? [], startOfDay(now))) {
    const first = b.name.split(' ')[0];
    const weekBefore = addDays(b.date, -7);
    weekBefore.setHours(9, 0, 0, 0);
    if (weekBefore > now && weekBefore <= horizon) {
      reminders.push({ key: `birthday:${b.key}:week:${toDateKey(b.date)}`, at: weekBefore, title: `🎂 In einer Woche: ${first} wird ${b.age}`, body: 'Schon eine Geschenkidee?', path: '/geburtstage' });
    }
    const onDay = new Date(b.date);
    onDay.setHours(8, 0, 0, 0);
    if (onDay > now && onDay <= horizon) {
      reminders.push({ key: `birthday:${b.key}:day:${toDateKey(b.date)}`, at: onDay, title: `🎉 ${first} hat heute Geburtstag`, body: `${first} wird ${b.age} – gratulieren nicht vergessen!`, path: '/geburtstage' });
    }
  }

  return reminders.sort((a, b) => a.at.getTime() - b.at.getTime()).slice(0, MAX_SCHEDULED);
}

/**
 * Schlüssel bereits angezeigter Erinnerungen, die sich erledigt haben: Gewohnheit heute abgehakt
 * (auch eine Erinnerung von gestern, wenn sie überfällig war), Aufgabe erledigt, Dienst erledigt.
 */
export function doneReminderKeys(tasks: Task[], userId: number, now = new Date(), habitData: HabitData = { habits: [], checkins: [] }): string[] {
  const keys: string[] = [];
  const todayKey = toDateKey(now);
  for (const habit of habitData.habits) {
    if (!habitStatus(habit, userId, habitData.checkins, todayKey).doneToday) continue;
    for (let i = 0; i <= 7; i++) keys.push(`habit:${habit.id}:${toDateKey(addDays(startOfDay(now), -i))}`);
  }
  for (const task of tasks) if (task.done && task.due_date) keys.push(`task:${task.id}:${task.due_date}`);
  const from = toDateKey(addDays(startOfDay(now), -2));
  const to = toDateKey(addDays(startOfDay(now), 2));
  for (const occ of allOccurrences(habitData.chores ?? [], from, to, habitData.choreDays ?? [])) {
    if (occ.doneBy !== null) keys.push(`chore:${occ.chore.id}:${occ.date}`);
  }
  return keys;
}

let syncing: Promise<void> = Promise.resolve();

/** Plant alle anstehenden Erinnerungen neu (nach jeder Änderung an Terminen oder Aufgaben) */
export function syncReminders(events: CalendarEvent[], tasks: Task[], userId: number, habitData?: HabitData) {
  if (!isNativeApp) return;
  syncing = syncing.then(async () => {
    if (!(await ensurePermission())) return;
    const { notifications: pending } = await LocalNotifications.getPending();
    if (pending.length) await LocalNotifications.cancel({ notifications: pending.map((n) => ({ id: n.id })) });
    // Schon angezeigte Erinnerungen wegräumen, die inzwischen erledigt sind (z. B. per NFC abgehakt)
    const done = new Set(doneReminderKeys(tasks, userId, new Date(), habitData).map(notificationId));
    const { notifications: shown } = await LocalNotifications.getDeliveredNotifications();
    const stale = shown.filter((n) => done.has(n.id));
    if (stale.length) await LocalNotifications.removeDeliveredNotifications({ notifications: stale });
    const reminders = buildReminders(events, tasks, userId, new Date(), habitData);
    if (!reminders.length) return;
    await LocalNotifications.schedule({
      notifications: reminders.map((r) => ({
        id: notificationId(r.key),
        title: r.title,
        body: r.body,
        channelId: REMINDER_CHANNEL,
        smallIcon: 'ic_stat_notify',
        iconColor: '#e8590c',
        schedule: { at: r.at, allowWhileIdle: true },
        extra: { path: r.path },
      })),
    });
  }).catch((err) => console.error('Erinnerungen konnten nicht geplant werden', err));
}

export function clearReminders() {
  if (!isNativeApp) return;
  void LocalNotifications.getPending()
    .then(({ notifications }) => {
      if (notifications.length) return LocalNotifications.cancel({ notifications });
    })
    .catch(() => {});
}

let listenersAdded = false;

/** Tipp auf eine Benachrichtigung öffnet die passende Seite */
export function listenForTaps(navigate: Navigate) {
  if (!isNativeApp || listenersAdded) return;
  listenersAdded = true;
  void LocalNotifications.addListener('localNotificationActionPerformed', (action) => {
    const path = action.notification.extra?.path;
    if (typeof path === 'string') navigate(path);
  });
  if (!PUSH_ENABLED) return;
  void PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
    const path = action.notification.data?.path;
    if (typeof path === 'string') navigate(path);
  });
  void PushNotifications.addListener('registration', ({ value }) => {
    try {
      localStorage.setItem(PUSH_TOKEN_KEY, value);
    } catch {
      // egal
    }
    void api('/devices', { method: 'POST', body: { token: value, platform: 'android' } }).catch(() => {});
  });
  void PushNotifications.addListener('registrationError', (err) => console.error('Push-Registrierung fehlgeschlagen', err));
}

/** Meldet dieses Gerät für Push-Benachrichtigungen an */
export async function registerPush() {
  if (!isNativeApp || !PUSH_ENABLED) return;
  try {
    let status = await PushNotifications.checkPermissions();
    if (status.receive === 'prompt' || status.receive === 'prompt-with-rationale') {
      status = await PushNotifications.requestPermissions();
    }
    if (status.receive !== 'granted') return;
    await PushNotifications.createChannel({
      id: 'familyconnect', name: 'Familie', description: 'Neue Beiträge, Termine und Einträge', importance: 4,
    });
    await PushNotifications.register();
  } catch (err) {
    console.error('Push nicht verfügbar', err);
  }
}

/** Beim Abmelden: dieses Gerät soll keine Nachrichten mehr für das Konto bekommen */
export function unregisterPush() {
  if (!isNativeApp || !PUSH_ENABLED) return;
  let token: string | null = null;
  try {
    token = localStorage.getItem(PUSH_TOKEN_KEY);
  } catch {
    // egal
  }
  // api() liest das Anmelde-Token sofort – muss also vor dem Abmelden aufgerufen werden
  if (token) void api('/devices/unregister', { method: 'POST', body: { token } }).catch(() => {});
}

export type Role = 'admin' | 'parent' | 'child';

export interface FamilySummary {
  id: number;
  name: string;
  role: Role;
}

export interface User {
  id: number;
  name: string;
  email: string;
  color: string;
  /** Farbschema der App, siehe themes.ts */
  theme: string;
  families: FamilySummary[];
}

export interface Member {
  id: number;
  name: string;
  color: string;
  birthday: string | null;
  role: Role;
  joined_at: string;
  /** ohne eigenes Handy/Konto (vom Admin angelegt) */
  managed?: boolean;
}

export interface Family {
  id: number;
  name: string;
  invite_code: string;
  /** Bundesland für Ferien und Feiertage (z. B. NW) */
  state: string | null;
  /** Ort fürs Wetter auf der Übersicht */
  weather_place: string | null;
  members: Member[];
}

interface Base {
  id: number;
  created_by: number | null;
  created_at: string;
}

export type Recurrence = 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly';

export interface CalendarEvent extends Base {
  title: string;
  description: string;
  location: string;
  start: string; // JJJJ-MM-TTTHH:MM (lokale Zeit)
  end: string;
  all_day: boolean;
  recurrence: Recurrence;
  member_ids: number[];
  /** ausgelassene Termine einer Serie (JJJJ-MM-TT) */
  exdates: string[];
  /** letzter Tag der Serie */
  until: string | null;
  /** Minuten vorher; bei ganztägigen Terminen relativ zu 9:00 Uhr */
  reminder_minutes: number | null;
  /** Name des importierten Kalenders (.ics), sonst leer */
  source: string;
  source_uid: string;
}

export interface List extends Base {
  name: string;
  kind: 'shopping' | 'todo';
  /** die feste „Einkaufsliste“ – nicht löschbar, nicht umbenennbar */
  is_default: boolean;
}

export interface ListItem extends Base {
  list_id: number;
  text: string;
  quantity: string;
  done: boolean;
  /** Warengruppe (groceries.ts); null = automatisch erkennen */
  category: string | null;
}

export interface Task extends Base {
  title: string;
  notes: string;
  assignee_id: number | null;
  due_date: string | null;
  done: boolean;
  recurrence: Recurrence;
}

export interface Post extends Base {
  text: string;
}

export type MealSlot = 'breakfast' | 'lunch' | 'dinner';

export interface Meal extends Base {
  date: string;
  slot: MealSlot;
  title: string;
  notes: string;
  recipe_id: number | null;
}

export interface Recipe extends Base {
  title: string;
  category: string;
  servings: number | null;
  duration: string;
  /** eine Zutat pro Zeile, Zeilen mit „:“ am Ende sind Zwischenüberschriften */
  ingredients: string;
  /** ein Arbeitsschritt pro Zeile */
  instructions: string;
  notes: string;
  source_url: string;
  image_url: string;
}

export interface Contact extends Base {
  name: string;
  category: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
  birthday: string | null;
}

export interface GiftIdea {
  id: number;
  for_user_id: number | null;
  for_contact_id: number | null;
  text: string;
  bought: boolean;
  created_by: number | null;
  created_at: string;
}

export interface Habit extends Base {
  title: string;
  emoji: string;
  interval_days: number;
  /** leer = alle Familienmitglieder */
  member_ids: number[];
  reminder_time: string | null;
  nfc_token: string;
  /** hängt an einem NFC-Aufkleber – Kinder haken dann nur per Aufkleber ab */
  nfc_linked: boolean;
}

export interface Chore extends Base {
  title: string;
  emoji: string;
  /** erster Termin, legt auch den Wochentag fest */
  start_date: string;
  interval_weeks: number;
  /** Reihenfolge der Rotation; leer = niemand fest */
  member_ids: number[];
  remind: 'none' | 'evening' | 'morning';
  notes: string;
  /** feste Termine (z. B. aus dem Abfallkalender); leer = Rhythmus */
  dates: string[];
}

/** Logo im Kalender für Termine mit dem Stichwort im Titel */
export interface EventIcon extends Base {
  keyword: string;
  /** data:image/…;base64,… (96 px) */
  image: string;
}

export interface Vacation extends Base {
  title: string;
  start_date: string;
  /** letzter Tag (einschließlich) */
  end_date: string;
  member_ids: number[];
  /** #rrggbb; leer = Farbe der ersten Person */
  color: string;
  notes: string;
}

/** Ausnahme an einem Termin: getauscht und/oder erledigt */
export interface ChoreDay {
  chore_id: number;
  date: string;
  assignee_id: number | null;
  done_by: number | null;
  done_at: string | null;
}

export interface Checkin {
  id: number;
  habit_id: number;
  user_id: number;
  date: string;
  source: 'app' | 'nfc' | 'button';
  created_by: number | null;
  created_at: string;
}

export type ResourceName = 'events' | 'lists' | 'items' | 'tasks' | 'posts' | 'meals' | 'contacts' | 'habits' | 'recipes' | 'chores' | 'vacations' | 'event-icons';

export interface FamilySummary {
  id: number;
  name: string;
  role: 'admin' | 'member';
}

export interface User {
  id: number;
  name: string;
  email: string;
  color: string;
  families: FamilySummary[];
}

export interface Member {
  id: number;
  name: string;
  color: string;
  role: 'admin' | 'member';
  joined_at: string;
}

export interface Family {
  id: number;
  name: string;
  invite_code: string;
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
}

export interface List extends Base {
  name: string;
  kind: 'shopping' | 'todo';
}

export interface ListItem extends Base {
  list_id: number;
  text: string;
  quantity: string;
  done: boolean;
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
}

export interface Contact extends Base {
  name: string;
  category: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
}

export type ResourceName = 'events' | 'lists' | 'items' | 'tasks' | 'posts' | 'meals' | 'contacts';

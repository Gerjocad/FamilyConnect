// Anstehende Geburtstage von Familienmitgliedern und Kontakten
import { useCallback, useEffect, useState } from 'react';
import { api } from './api';
import { parseLocal, startOfDay, toDateKey } from './dates';
import { onLiveChange } from './live';
import { useFamily } from './session';
import type { Contact, GiftIdea, Member } from './types';

export interface UpcomingBirthday {
  key: string;
  name: string;
  /** nächster Geburtstag (heute oder später) */
  date: Date;
  daysUntil: number;
  /** so alt wird die Person */
  age: number;
  member?: Member;
  contact?: Contact;
}

/** Nächster Geburtstag ab `today`; am 29. Februar in Nicht-Schaltjahren der 28. */
export function nextBirthday(birthday: string, today = startOfDay(new Date())) {
  const born = parseLocal(birthday);
  const on = (year: number) => {
    const d = new Date(year, born.getMonth(), born.getDate());
    return d.getMonth() === born.getMonth() ? d : new Date(year, born.getMonth() + 1, 0);
  };
  let next = on(today.getFullYear());
  if (next < today) next = on(today.getFullYear() + 1);
  return { date: next, age: next.getFullYear() - born.getFullYear(), daysUntil: Math.round((next.getTime() - today.getTime()) / 86_400_000) };
}

export function upcomingBirthdays(members: Member[], contacts: Contact[], today = startOfDay(new Date())): UpcomingBirthday[] {
  const list: UpcomingBirthday[] = [
    ...members.filter((m) => m.birthday).map((m) => ({ key: `m${m.id}`, name: m.name, member: m, ...nextBirthday(m.birthday!, today) })),
    ...contacts.filter((c) => c.birthday).map((c) => ({ key: `c${c.id}`, name: c.name, contact: c, ...nextBirthday(c.birthday!, today) })),
  ];
  return list.sort((a, b) => a.daysUntil - b.daysUntil || a.name.localeCompare(b.name, 'de'));
}

/** „Heute“, „Morgen“, „in 5 Tagen“ */
export function untilLabel(days: number) {
  if (days === 0) return 'Heute 🎉';
  if (days === 1) return 'Morgen';
  return `in ${days} Tagen`;
}

/** Geburtstage als Kalendereinträge für einen Zeitraum (JJJJ-MM-TT → Beschriftungen) */
export function birthdaysInRange(members: Member[], contacts: Contact[], from: Date, to: Date) {
  const result: { date: string; label: string }[] = [];
  for (const b of upcomingBirthdays(members, contacts, from)) {
    for (let d = b.date, age = b.age; d <= to; d = new Date(d.getFullYear() + 1, d.getMonth(), d.getDate()), age++) {
      result.push({ date: toDateKey(d), label: `🎂 ${b.name.split(' ')[0]} (${age})` });
    }
  }
  return result;
}

export function useGiftIdeas() {
  const { family } = useFamily();
  const base = `/families/${family.id}/gift-ideas`;
  const [items, setItems] = useState<GiftIdea[]>([]);
  const reload = useCallback(async () => {
    try {
      setItems(await api<GiftIdea[]>(base));
    } catch {
      // offline
    }
  }, [base]);
  useEffect(() => {
    void reload();
    return onLiveChange((resource) => resource === 'gift-ideas' && void reload());
  }, [reload]);
  const add = async (body: { for_user_id?: number; for_contact_id?: number; text: string }) => {
    await api(base, { method: 'POST', body });
    await reload();
  };
  const toggle = async (idea: GiftIdea) => {
    await api(`${base}/${idea.id}`, { method: 'PATCH', body: { bought: !idea.bought } });
    await reload();
  };
  const remove = async (idea: GiftIdea) => {
    await api(`${base}/${idea.id}`, { method: 'DELETE' });
    await reload();
  };
  return { items, add, toggle, remove };
}

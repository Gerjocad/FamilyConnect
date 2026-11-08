// Karten der Übersicht: jeder legt selbst fest, welche er sieht und in welcher Reihenfolge (gespeichert am Konto)
export const CARDS = [
  { id: 'weather', label: 'Wetter', icon: '🌤️' },
  { id: 'locate', label: 'Wo bist du?', icon: '📍' },
  { id: 'where', label: 'Wo ist wer? (Orte)', icon: '🏠' },
  { id: 'calendar', label: 'Die nächsten 7 Tage', icon: '📅' },
  { id: 'polls', label: 'Familien-Umfrage', icon: '🗳️' },
  { id: 'tasks', label: 'Für dich zu tun', icon: '✅' },
  { id: 'habits', label: 'Gewohnheiten', icon: '🔁' },
  { id: 'smart', label: 'Smart Home', icon: '💡' },
  { id: 'climate', label: 'Raumklima', icon: '🌡️' },
  { id: 'birthdays', label: 'Geburtstage', icon: '🎂' },
  { id: 'chores', label: 'Dienste heute & morgen', icon: '🧹' },
  { id: 'meals', label: 'Heute auf dem Tisch', icon: '🍽️' },
  { id: 'posts', label: 'Pinnwand', icon: '💬' },
] as const;

export type CardId = (typeof CARDS)[number]['id'];

export interface DashboardSettings {
  order: string[];
  hidden: string[];
}

const ALL = CARDS.map((c) => c.id) as CardId[];
const isCard = (id: string): id is CardId => (ALL as string[]).includes(id);

/** Alle Karten in der eingestellten Reihenfolge; neue Karten (noch nicht in der Einstellung) hinten an */
export function orderedCards(settings: DashboardSettings | null | undefined): CardId[] {
  const saved = (settings?.order ?? []).filter(isCard);
  return [...saved, ...ALL.filter((id) => !saved.includes(id))];
}

/** Nur die sichtbaren Karten in Reihenfolge */
export function visibleCards(settings: DashboardSettings | null | undefined): CardId[] {
  const hidden = settings?.hidden ?? [];
  return orderedCards(settings).filter((id) => !hidden.includes(id));
}

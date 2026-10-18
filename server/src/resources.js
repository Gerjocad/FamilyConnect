import { nextDueDate } from './dates.js';

// Beschreibt die Familien-Ressourcen (Kalender, Listen, …) deklarativ.
// Daraus erzeugt crud.js die REST-Endpunkte inkl. Validierung.

const text = (opts = {}) => ({ type: 'text', ...opts });
const bool = () => ({ type: 'bool' });
const oneOf = (values, opts = {}) => ({ type: 'enum', values, ...opts });
const date = (opts = {}) => ({ type: 'date', ...opts });
const dateTime = (opts = {}) => ({ type: 'datetime', ...opts });
const member = () => ({ type: 'member' });
const members = () => ({ type: 'members' });
const listRef = (opts = {}) => ({ type: 'list', ...opts });
const dates = () => ({ type: 'dates' });
const recipeRef = () => ({ type: 'recipe' });
const int = (min, max, opts = {}) => ({ type: 'int', min, max, ...opts });
const time = () => ({ type: 'time' });

const RECURRENCES = ['none', 'daily', 'weekly', 'monthly', 'yearly'];
// Minuten vor Beginn; bei ganztägigen Terminen relativ zu 9:00 Uhr
export const REMINDER_OPTIONS = [0, 5, 10, 15, 30, 60, 120, 1440, 2880];

export const RESOURCES = [
  {
    path: 'events',
    table: 'events',
    order: 'start ASC',
    fields: {
      title: text({ required: true, max: 200 }),
      description: text({ max: 5000 }),
      location: text({ max: 300 }),
      start: dateTime({ required: true }),
      end: dateTime({ required: true }),
      all_day: bool(),
      recurrence: oneOf(RECURRENCES, { default: 'none' }),
      member_ids: members(),
      // Einzelne ausgelassene Termine einer Serie (z. B. weil sie verschoben wurden)
      exdates: dates(),
      // Letzter Tag der Serie ("dieser und alle folgenden Termine löschen")
      until: date(),
      reminder_minutes: oneOf(REMINDER_OPTIONS, { default: null }),
    },
    check(row) {
      if (row.end < row.start) return 'Das Ende darf nicht vor dem Beginn liegen';
      if (row.until && row.until < row.start.slice(0, 10)) return 'Die Serie darf nicht vor ihrem Beginn enden';
    },
  },
  {
    path: 'lists',
    table: 'lists',
    order: 'created_at ASC, id ASC',
    fields: {
      name: text({ required: true, max: 100 }),
      kind: oneOf(['shopping', 'todo'], { default: 'shopping' }),
    },
    // Beim Löschen einer Liste verschwinden auch die Einträge
    alsoChanges: ['items'],
  },
  {
    path: 'items',
    table: 'list_items',
    order: 'done ASC, created_at ASC, id ASC',
    fields: {
      list_id: listRef({ required: true }),
      text: text({ required: true, max: 200 }),
      quantity: text({ max: 50 }),
      done: bool(),
    },
  },
  {
    path: 'tasks',
    table: 'tasks',
    order: 'done ASC, due_date IS NULL, due_date ASC, id ASC',
    fields: {
      title: text({ required: true, max: 200 }),
      notes: text({ max: 5000 }),
      assignee_id: member(),
      due_date: date(),
      done: bool(),
      recurrence: oneOf(RECURRENCES, { default: 'none' }),
    },
    // Wiederkehrende Aufgaben werden beim Abhaken nicht erledigt, sondern rücken zum nächsten Termin vor
    transform(row, existing) {
      const justDone = row.done === 1 && (!existing || existing.done === 0);
      if (justDone && row.recurrence !== 'none') {
        row.done = 0;
        row.due_date = nextDueDate(row.due_date, row.recurrence);
      }
    },
  },
  {
    path: 'posts',
    table: 'posts',
    order: 'created_at DESC, id DESC',
    limit: 200,
    ownerOnly: true,
    fields: {
      text: text({ required: true, max: 5000 }),
    },
  },
  {
    path: 'meals',
    table: 'meals',
    order: 'date ASC, slot ASC',
    fields: {
      date: date({ required: true }),
      slot: oneOf(['breakfast', 'lunch', 'dinner'], { required: true }),
      title: text({ required: true, max: 200 }),
      notes: text({ max: 2000 }),
      // Gericht aus den Rezepten (optional)
      recipe_id: recipeRef(),
    },
    conflictMessage: 'Für diese Mahlzeit ist bereits etwas geplant',
  },
  {
    path: 'recipes',
    table: 'recipes',
    order: 'title COLLATE NOCASE ASC',
    // Beim Löschen verlieren Essensplan-Einträge ihre Verknüpfung
    alsoChanges: ['meals'],
    fields: {
      title: text({ required: true, max: 200 }),
      category: text({ max: 100 }),
      servings: int(1, 100),
      duration: text({ max: 50 }),
      ingredients: text({ max: 10000 }),
      instructions: text({ max: 20000 }),
      notes: text({ max: 2000 }),
      source_url: text({ max: 1000 }),
      image_url: text({ max: 1000 }),
    },
    check(row) {
      for (const field of ['source_url', 'image_url']) {
        if (row[field] && !/^https?:\/\/\S+$/i.test(row[field])) return 'Links müssen mit http:// oder https:// beginnen';
      }
    },
  },
  {
    path: 'habits',
    table: 'habits',
    order: 'title COLLATE NOCASE ASC',
    // Abhaken läuft über eigene Routen (habits.js); beim Löschen verschwinden auch die Einträge
    alsoChanges: ['checkins'],
    fields: {
      title: text({ required: true, max: 100 }),
      emoji: text({ max: 16 }),
      interval_days: int(1, 365, { required: true }),
      // leer = alle Familienmitglieder
      member_ids: members(),
      reminder_time: time(),
    },
  },
  {
    path: 'contacts',
    table: 'contacts',
    order: 'name COLLATE NOCASE ASC',
    fields: {
      name: text({ required: true, max: 200 }),
      category: text({ max: 100 }),
      phone: text({ max: 50 }),
      email: text({ max: 200 }),
      address: text({ max: 500 }),
      notes: text({ max: 2000 }),
    },
  },
];

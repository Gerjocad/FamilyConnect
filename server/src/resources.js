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
      recurrence: oneOf(['none', 'daily', 'weekly', 'monthly', 'yearly'], { default: 'none' }),
      member_ids: members(),
    },
    check(row) {
      if (row.end < row.start) return 'Das Ende darf nicht vor dem Beginn liegen';
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
    },
    conflictMessage: 'Für diese Mahlzeit ist bereits etwas geplant',
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

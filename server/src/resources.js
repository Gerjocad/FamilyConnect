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

// Warengruppen der Einkaufsliste – gleiche Schlüssel wie in client/src/groceries.ts
export const GROCERY_GROUPS = ['produce', 'bakery', 'dairy', 'meat', 'frozen', 'pantry', 'breakfast', 'snacks', 'drinks', 'drugstore', 'household', 'pets', 'other'];

const RECURRENCES = ['none', 'daily', 'weekly', 'monthly', 'yearly'];
// Minuten vor Beginn; bei ganztägigen Terminen relativ zu 9:00 Uhr
// Regeln für Kinder (Rolle „child“): Rückgabe = Fehlermeldung, nichts = erlaubt
const ownOnly = (message) => ({ action, userId, existing }) =>
  action !== 'create' && existing.created_by !== userId ? message : undefined;

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
      // abgesagt statt gelöscht: der ganze Termin bzw. einzelne Tage einer Serie
      cancelled: bool(),
      cancelled_dates: dates(),
      // importierte Kalender (.ics): erneuter Import aktualisiert Termine mit gleicher UID
      source: text({ max: 100 }),
      source_uid: text({ max: 500 }),
    },
    // beim Löschen verschwinden auch die Kommentare
    alsoChanges: ['event-comments'],
    importKey: 'source_uid',
    importGroup: 'source',
    childRule: ownOnly('Kinder dürfen nur eigene Termine ändern'),
    check(row) {
      if (row.end < row.start) return 'Das Ende darf nicht vor dem Beginn liegen';
      if (row.until && row.until < row.start.slice(0, 10)) return 'Die Serie darf nicht vor ihrem Beginn enden';
    },
  },
  {
    path: 'lists',
    table: 'lists',
    // Die feste Einkaufsliste immer zuerst
    order: 'is_default DESC, created_at ASC, id ASC',
    readOnlyBools: ['is_default'],
    guard({ action, existing, row }) {
      if (!existing?.is_default) return;
      if (action === 'delete') return 'Die Einkaufsliste kann nicht gelöscht werden';
      if (row.name !== existing.name || row.kind !== existing.kind) return 'Die Einkaufsliste kann nicht umbenannt werden';
    },
    fields: {
      name: text({ required: true, max: 100 }),
      kind: oneOf(['shopping', 'todo'], { default: 'shopping' }),
    },
    childRule: ownOnly('Kinder dürfen nur eigene Listen umbenennen oder löschen'),
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
      // Warengruppe (client/src/groceries.ts); leer = automatisch erkennen
      category: oneOf(GROCERY_GROUPS, { default: null }),
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
    // Kinder legen Aufgaben nur für sich an; fremde Aufgaben dürfen sie nur abhaken (eigene oder für alle)
    childRule({ action, userId, body, existing, row }) {
      const own = action === 'create' || existing.created_by === userId;
      if (own && action !== 'delete') {
        if (row.assignee_id !== userId) return 'Kinder können Aufgaben nur für sich selbst anlegen';
        return;
      }
      if (action === 'delete') return own ? undefined : 'Kinder dürfen nur eigene Aufgaben löschen';
      const onlyDone = Object.keys(body).every((key) => key === 'done');
      if (!onlyDone || (existing.assignee_id !== null && existing.assignee_id !== userId))
        return 'Kinder dürfen diese Aufgabe nur abhaken, wenn sie ihnen gehört';
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
    // Beim Löschen eines Beitrags verschwindet auch eine Abstimmung daran
    alsoChanges: ['polls', 'post-extras'],
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
    childRule: () => 'Gewohnheiten legen Eltern an',
    fields: {
      title: text({ required: true, max: 100 }),
      emoji: text({ max: 16 }),
      interval_days: int(1, 365, { required: true }),
      // leer = alle Familienmitglieder
      member_ids: members(),
      reminder_time: time(),
      // wird beim ersten Abhaken per Aufkleber automatisch gesetzt (habits.js)
      nfc_linked: bool(),
    },
  },
  {
    path: 'chores',
    table: 'chores',
    order: 'title COLLATE NOCASE ASC',
    // Abhaken und Tauschen laufen über chores.js; beim Löschen verschwinden auch die Ausnahmen
    alsoChanges: ['chores'],
    childRule: () => 'Dienste legen Eltern an',
    fields: {
      title: text({ required: true, max: 100 }),
      emoji: text({ max: 16 }),
      start_date: date({ required: true }),
      interval_weeks: int(1, 8, { required: true }),
      member_ids: members(),
      remind: oneOf(['none', 'evening', 'morning'], { default: 'evening' }),
      notes: text({ max: 500 }),
      // feste Termine (Abfallkalender); dann gilt der erste als Start
      dates: dates(),
    },
    transform(row) {
      const fixed = JSON.parse(row.dates);
      if (fixed.length) row.start_date = fixed[0];
    },
  },
  {
    path: 'vacations',
    table: 'vacations',
    order: 'start_date ASC, id ASC',
    fields: {
      title: text({ required: true, max: 100 }),
      start_date: date({ required: true }),
      end_date: date({ required: true }),
      member_ids: members(),
      color: text({ max: 7 }),
      notes: text({ max: 1000 }),
    },
    childRule: ownOnly('Kinder dürfen nur eigene Urlaube ändern'),
    check(row) {
      if (row.end_date < row.start_date) return 'Das Ende darf nicht vor dem Beginn liegen';
      if (row.color && !/^#[0-9a-f]{6}$/i.test(row.color)) return 'Ungültige Farbe';
    },
  },
  {
    path: 'event-icons',
    table: 'event_icons',
    order: 'keyword COLLATE NOCASE ASC',
    childRule: () => 'Logos legen Eltern an',
    fields: {
      keyword: text({ required: true, max: 60 }),
      // optional: Logo nur zeigen, wenn auch dieses Wort im Titel steht (z. B. Gegner-Wappen nur bei Fenerbahçe-Spielen)
      only_with: text({ max: 60 }),
      // Termine mit diesem Stichwort (z. B. Fenerbahçe) heute/morgen groß auf dem Wanddisplay
      highlight: bool(),
      image: text({ required: true, max: 60000 }),
    },
    check(row) {
      if (!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(row.image)) return 'Nur PNG-, JPEG- oder WebP-Bilder';
    },
  },
  {
    path: 'loans',
    table: 'loans',
    order: 'returned ASC, due_date ASC, id ASC',
    fields: {
      title: text({ required: true, max: 200 }),
      author: text({ max: 200 }),
      member_id: member(),
      lender: text({ max: 100 }),
      borrowed_on: date(),
      due_date: date({ required: true }),
      // so viele Tage vorher erinnern (0 = nur am Tag selbst)
      remind_days: int(0, 14, { default: 1 }),
      returned: bool(),
      notes: text({ max: 1000 }),
    },
    // Kinder verwalten, was sie selbst ausgeliehen oder eingetragen haben
    childRule({ action, userId, existing, row }) {
      if (action !== 'create' && existing.created_by !== userId && existing.member_id !== userId)
        return 'Kinder dürfen nur ihre eigenen Ausleihen ändern';
      if (action !== 'delete' && row.member_id !== null && row.member_id !== userId)
        return 'Kinder tragen nur eigene Ausleihen ein';
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
      birthday: date(),
    },
  },
];

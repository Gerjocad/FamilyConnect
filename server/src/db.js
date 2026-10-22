import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const SCHEMA = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  color TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS families (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  invite_code TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS memberships (
  family_id INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'child',
  joined_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (family_id, user_id)
);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY,
  family_id INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  location TEXT NOT NULL DEFAULT '',
  start TEXT NOT NULL,
  end TEXT NOT NULL,
  all_day INTEGER NOT NULL DEFAULT 0,
  recurrence TEXT NOT NULL DEFAULT 'none',
  member_ids TEXT NOT NULL DEFAULT '[]',
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS lists (
  id INTEGER PRIMARY KEY,
  family_id INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'shopping',
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS list_items (
  id INTEGER PRIMARY KEY,
  family_id INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  list_id INTEGER NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  quantity TEXT NOT NULL DEFAULT '',
  done INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY,
  family_id INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  assignee_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  due_date TEXT,
  done INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY,
  family_id INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  text TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS meals (
  id INTEGER PRIMARY KEY,
  family_id INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  slot TEXT NOT NULL,
  title TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (family_id, date, slot)
);

CREATE TABLE IF NOT EXISTS contacts (
  id INTEGER PRIMARY KEY,
  family_id INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

// Spalten, die nach der ersten Version dazugekommen sind. Bestehende Datenbanken werden beim Start ergänzt.
const ADDED_COLUMNS = [
  ['events', 'exdates', "TEXT NOT NULL DEFAULT '[]'"],
  ['events', 'until', 'TEXT'],
  ['events', 'reminder_minutes', 'INTEGER'],
  // Aus einer Kalenderdatei (.ics) importiert: Name des Kalenders und UID des Termins (für erneuten Import)
  ['events', 'source', "TEXT NOT NULL DEFAULT ''"],
  ['events', 'source_uid', "TEXT NOT NULL DEFAULT ''"],
  ['tasks', 'recurrence', "TEXT NOT NULL DEFAULT 'none'"],
  // Bundesland für Ferien und Feiertage (Kürzel wie NW, server/src/holidays.js)
  ['families', 'state', 'TEXT'],
  ['families', 'weather_place', 'TEXT'],
  // Eigene Ankunft/Abfahrt an Orten teilen (jeder entscheidet selbst, je Familie)
  ['memberships', 'share_places', 'INTEGER NOT NULL DEFAULT 0'],
  ['loans', 'remind_days', 'INTEGER DEFAULT 1'],
  ['families', 'weather_lat', 'REAL'],
  ['families', 'weather_lon', 'REAL'],
  // Die feste Einkaufsliste jeder Familie (nicht löschbar)
  ['lists', 'is_default', 'INTEGER NOT NULL DEFAULT 0'],
  // Warengruppe eines Eintrags (client/src/groceries.ts); leer = automatisch erkennen
  ['list_items', 'category', 'TEXT'],
  // Feste Termine eines Dienstes (z. B. aus dem Abfallkalender); leer = Rhythmus über start_date/interval_weeks
  ['chores', 'dates', "TEXT NOT NULL DEFAULT '[]'"],
  // Gewohnheit hängt an einem NFC-Aufkleber: Kinder haken dann nur per Aufkleber ab
  ['habits', 'nfc_linked', 'INTEGER NOT NULL DEFAULT 0'],
  // Geburtstag (JJJJ-MM-TT)
  ['users', 'birthday', 'TEXT'],
  // Familienmitglied ohne eigenes Handy/Konto (vom Admin angelegt, kann sich nicht anmelden)
  ['users', 'managed', 'INTEGER NOT NULL DEFAULT 0'],
  // Bis wann die Neuigkeiten (Glocke oben) gelesen sind
  ['memberships', 'activity_seen_at', 'TEXT'],
  ['contacts', 'birthday', 'TEXT'],
  // Farbschema der App (client/src/themes.ts)
  ['users', 'theme', "TEXT NOT NULL DEFAULT 'orange'"],
  ['meals', 'recipe_id', 'INTEGER REFERENCES recipes(id) ON DELETE SET NULL'],
];

const ADDED_TABLES = `
CREATE TABLE IF NOT EXISTS habits (
  id INTEGER PRIMARY KEY,
  family_id INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  emoji TEXT NOT NULL DEFAULT '',
  interval_days INTEGER NOT NULL DEFAULT 1,
  member_ids TEXT NOT NULL DEFAULT '[]',
  reminder_time TEXT,
  -- Geheimer Teil der NFC-Adresse (familyconnect://h/<token>)
  nfc_token TEXT NOT NULL UNIQUE DEFAULT (lower(hex(randomblob(16)))),
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS habit_checkins (
  id INTEGER PRIMARY KEY,
  family_id INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  habit_id INTEGER NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'app',
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (habit_id, user_id, date)
);

CREATE TABLE IF NOT EXISTS feedback (
  id INTEGER PRIMARY KEY,
  family_id INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  kind TEXT NOT NULL DEFAULT 'idea',
  text TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  -- Dateinamen der Screenshots im Upload-Ordner
  images TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS recipes (
  id INTEGER PRIMARY KEY,
  family_id INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT '',
  servings INTEGER,
  duration TEXT NOT NULL DEFAULT '',
  -- eine Zutat pro Zeile; Zeilen mit „:“ am Ende sind Zwischenüberschriften
  ingredients TEXT NOT NULL DEFAULT '',
  -- ein Arbeitsschritt pro Zeile
  instructions TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  source_url TEXT NOT NULL DEFAULT '',
  image_url TEXT NOT NULL DEFAULT '',
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS complaints (
  id INTEGER PRIMARY KEY,
  family_id INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  recipient_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  text TEXT NOT NULL,
  -- Dateinamen der Fotos im Upload-Ordner
  images TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'open',
  reply TEXT NOT NULL DEFAULT '',
  resolved_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  resolved_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS requests (
  id INTEGER PRIMARY KEY,
  family_id INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  recipient_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  category TEXT NOT NULL DEFAULT 'general',
  title TEXT NOT NULL,
  details TEXT NOT NULL DEFAULT '',
  date TEXT,
  time_from TEXT,
  time_to TEXT,
  -- pending → approved | declined | countered → (approved | withdrawn); withdrawn auch direkt
  status TEXT NOT NULL DEFAULT 'pending',
  response_note TEXT NOT NULL DEFAULT '',
  counter_date TEXT,
  counter_time_from TEXT,
  counter_time_to TEXT,
  counter_accepted INTEGER NOT NULL DEFAULT 0,
  event_id INTEGER REFERENCES events(id) ON DELETE SET NULL,
  responded_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS chores (
  id INTEGER PRIMARY KEY,
  family_id INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  emoji TEXT NOT NULL DEFAULT '',
  -- erster Termin; legt auch den Wochentag fest
  start_date TEXT NOT NULL,
  interval_weeks INTEGER NOT NULL DEFAULT 1,
  -- Reihenfolge der Rotation; leer = niemand fest, nur Erinnerung für alle
  member_ids TEXT NOT NULL DEFAULT '[]',
  -- none | evening (Vorabend 19 Uhr) | morning (7 Uhr am Tag)
  remind TEXT NOT NULL DEFAULT 'evening',
  notes TEXT NOT NULL DEFAULT '',
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Kommentare an Terminen; bei Serien gilt ein Kommentar für einen Tag (date)
CREATE TABLE IF NOT EXISTS event_comments (
  id INTEGER PRIMARY KEY,
  family_id INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  text TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS event_comments_event ON event_comments(event_id);

-- Wer bei einem Termin eingetragen wurde (beim Anlegen oder später) – für die Glocke
CREATE TABLE IF NOT EXISTS event_mentions (
  id INTEGER PRIMARY KEY,
  family_id INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS event_mentions_user ON event_mentions(family_id, user_id);

-- Wunschlisten: reserved_by sieht der Wünschende nie
CREATE TABLE IF NOT EXISTS wishes (
  id INTEGER PRIMARY KEY,
  family_id INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  link TEXT NOT NULL DEFAULT '',
  price TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  reserved_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  reserved_at TEXT,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Wanddisplays: Lese-Zugang per Link (z. B. altes Tablet an der Wand), vom Admin widerrufbar
CREATE TABLE IF NOT EXISTS wall_displays (
  id INTEGER PRIMARY KEY,
  family_id INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen_at TEXT
);

-- Kommentare zu Beschwerden (sehen nur, wer die Beschwerde sehen darf)
CREATE TABLE IF NOT EXISTS complaint_comments (
  id INTEGER PRIMARY KEY,
  family_id INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  complaint_id INTEGER NOT NULL REFERENCES complaints(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  text TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS complaint_comments_complaint ON complaint_comments(complaint_id);

-- Ausgeliehenes (z. B. Bücher aus der Bücherei) mit Rückgabedatum
CREATE TABLE IF NOT EXISTS loans (
  id INTEGER PRIMARY KEY,
  family_id INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  author TEXT NOT NULL DEFAULT '',
  member_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  lender TEXT NOT NULL DEFAULT '',
  borrowed_on TEXT,
  due_date TEXT NOT NULL,
  returned INTEGER NOT NULL DEFAULT 0,
  notes TEXT NOT NULL DEFAULT '',
  -- zuletzt verschickte Erinnerung, z. B. „2026-10-21:morgen“ (pro Tag und Art nur einmal)
  reminded TEXT NOT NULL DEFAULT '',
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Orte (Zuhause, Schule, Arbeit …) für „angekommen/losgegangen“ – Android meldet das Betreten/Verlassen
CREATE TABLE IF NOT EXISTS places (
  id INTEGER PRIMARY KEY,
  family_id INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT '📍',
  address TEXT NOT NULL DEFAULT '',
  lat REAL NOT NULL,
  lon REAL NOT NULL,
  radius INTEGER NOT NULL DEFAULT 50,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Wer worüber Bescheid bekommen möchte: Person (member_id) an Ort, Ankommen/Verlassen, optional Zeitfenster
CREATE TABLE IF NOT EXISTS place_prefs (
  id INTEGER PRIMARY KEY,
  family_id INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  member_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  place_id INTEGER NOT NULL REFERENCES places(id) ON DELETE CASCADE,
  arrive INTEGER NOT NULL DEFAULT 1,
  leave INTEGER NOT NULL DEFAULT 0,
  weekdays_only INTEGER NOT NULL DEFAULT 0,
  from_time TEXT,
  to_time TEXT,
  UNIQUE (user_id, member_id, place_id)
);

-- Wo jemand gerade ist (letzte Meldung je Person und Ort)
CREATE TABLE IF NOT EXISTS place_presence (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  place_id INTEGER NOT NULL REFERENCES places(id) ON DELETE CASCADE,
  inside INTEGER NOT NULL,
  changed_at TEXT NOT NULL,
  notified_enter_at TEXT,
  notified_exit_at TEXT,
  PRIMARY KEY (user_id, place_id)
);

-- Pinnwand: Kommentare und Reaktionen (eine je Person und Beitrag)
CREATE TABLE IF NOT EXISTS post_comments (
  id INTEGER PRIMARY KEY,
  family_id INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  text TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS post_comments_post ON post_comments(post_id);
CREATE TABLE IF NOT EXISTS post_reactions (
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (post_id, user_id)
);

-- Logos/Symbole im Kalender: Termine mit dem Stichwort im Titel zeigen das Bild
CREATE TABLE IF NOT EXISTS event_icons (
  id INTEGER PRIMARY KEY,
  family_id INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  keyword TEXT NOT NULL,
  -- kleines Bild als data:-URL (im Browser auf 96 px verkleinert)
  image TEXT NOT NULL,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Urlaube: mehrtägig, im Kalender leicht eingefärbt wie die Schulferien
CREATE TABLE IF NOT EXISTS vacations (
  id INTEGER PRIMARY KEY,
  family_id INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  member_ids TEXT NOT NULL DEFAULT '[]',
  -- Farbe der Markierung (#rrggbb); leer = Farbe der ersten Person
  color TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Ausnahmen pro Termin eines Dienstes: getauscht und/oder erledigt
CREATE TABLE IF NOT EXISTS chore_days (
  chore_id INTEGER NOT NULL REFERENCES chores(id) ON DELETE CASCADE,
  family_id INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  assignee_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  done_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  done_at TEXT,
  PRIMARY KEY (chore_id, date)
);

-- Geschenkideen für ein Mitglied (das sie nicht sieht) oder einen Kontakt
CREATE TABLE IF NOT EXISTS gift_ideas (
  id INTEGER PRIMARY KEY,
  family_id INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  for_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  for_contact_id INTEGER REFERENCES contacts(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  bought INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Abstimmungen: Antworten und Stimmen gehören zu einem Pinnwand-Beitrag
CREATE TABLE IF NOT EXISTS poll_options (
  id INTEGER PRIMARY KEY,
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS poll_votes (
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  option_id INTEGER NOT NULL REFERENCES poll_options(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (post_id, user_id)
);

-- Tuya-Thermometer, die eine Familie sieht, mit Grenzwerten für Warnungen
CREATE TABLE IF NOT EXISTS climate_sensors (
  family_id INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL,
  label TEXT NOT NULL DEFAULT '',
  min_temp REAL,
  max_temp REAL,
  min_humidity REAL,
  max_humidity REAL,
  position INTEGER NOT NULL DEFAULT 0,
  -- zuletzt gemeldete Überschreitungen (JSON), damit nicht ständig gewarnt wird
  alert_state TEXT NOT NULL DEFAULT '[]',
  PRIMARY KEY (family_id, device_id)
);

CREATE TABLE IF NOT EXISTS devices (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform TEXT NOT NULL DEFAULT 'android',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

function migrate(db) {
  // Zuerst die neuen Tabellen, weil neue Spalten auf sie verweisen können (meals.recipe_id)
  db.exec(ADDED_TABLES);
  for (const [table, column, definition] of ADDED_COLUMNS) {
    const exists = db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === column);
    if (!exists) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
  // Früher gab es nur Admin und „Mitglied“ – bisherige Mitglieder werden Eltern
  db.exec("UPDATE memberships SET role = 'parent' WHERE role = 'member'");
  for (const { id } of db.prepare('SELECT id FROM families').all()) ensureShoppingList(db, id);
}

/** Jede Familie hat genau eine feste „Einkaufsliste“; eine vorhandene gleichnamige wird übernommen */
export function ensureShoppingList(db, familyId) {
  if (db.prepare('SELECT 1 FROM lists WHERE family_id = ? AND is_default = 1').get(familyId)) return;
  const existing = db.prepare(
    "SELECT id FROM lists WHERE family_id = ? AND kind = 'shopping' AND name = 'Einkaufsliste' COLLATE NOCASE ORDER BY id LIMIT 1"
  ).get(familyId);
  if (existing) db.prepare("UPDATE lists SET is_default = 1, name = 'Einkaufsliste' WHERE id = ?").run(existing.id);
  else db.prepare("INSERT INTO lists (family_id, name, kind, is_default) VALUES (?, 'Einkaufsliste', 'shopping', 1)").run(familyId);
}

export function openDatabase(file) {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(SCHEMA);
  migrate(db);
  return db;
}

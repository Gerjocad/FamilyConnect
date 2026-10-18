// Änderungsverlauf für die Seite „Neuigkeiten“ (Familie & Profil → Neuigkeiten).
// Bei jeder Änderung oben einen Eintrag ergänzen – neueste Version zuerst.
// `apk: true` markiert Versionen, für die das App-Update (neue APK) nötig ist.

export interface ChangelogEntry {
  version: string;
  date: string; // JJJJ-MM-TT
  title: string;
  changes: string[];
  apk?: boolean;
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.9',
    date: '2026-10-18',
    title: 'Neuigkeiten',
    changes: [
      'Neue Seite „Neuigkeiten“ unter Familie & Profil: Was sich von Version zu Version geändert hat',
      'Hinweis „Neu“, solange du die neueste Version noch nicht angesehen hast',
      'Beim Wechsel auf eine andere Seite beginnt sie jetzt immer oben',
    ],
  },
  {
    version: '1.8',
    date: '2026-10-18',
    title: 'Zurück-Taste, neue Leiste und Feedback',
    changes: [
      'Android-Zurück-Taste führt von jedem Bildschirm zur Übersicht (offene Fenster werden zuerst geschlossen)',
      'Untere Leiste mit großem, rundem Übersicht-Knopf in der Mitte',
      'Neuer Bereich „Feedback“: Fehler und Wünsche melden, mit bis zu 5 Screenshots',
      'Übersicht: ganze Karten antippbar statt „Alle“-Links',
    ],
  },
  {
    version: '1.7',
    date: '2026-10-18',
    title: 'Aufgaben zuweisen',
    changes: [
      '„Wer erledigt es?“ direkt unter dem Eingabefeld für neue Aufgaben',
      'Schnelleingabe bei Aufgaben und Listen: beim schnellen Weitertippen geht nichts mehr verloren',
    ],
  },
  {
    version: '1.6',
    date: '2026-10-18',
    title: 'Automatische Updates',
    changes: [
      'Die App lädt ihre Oberfläche vom Server – Neuerungen kommen ohne neue APK',
      'Hinweis „Neue App-Version – Installieren“, wenn doch einmal eine neue APK nötig ist',
      'Der Server aktualisiert sich jede Nacht selbst',
      'Seite „Keine Verbindung“, wenn der Server nicht erreichbar ist',
    ],
    apk: true,
  },
  {
    version: '1.5',
    date: '2026-10-18',
    title: 'Gewohnheiten mit NFC-Aufklebern',
    changes: [
      'Neuer Bereich „Gewohnheiten“, z. B. „Duschen alle 2 Tage“ – mit Serie 🔥 und Wochenpunkten',
      'Abhaken per NFC-Aufkleber: Handy daranhalten, fertig',
      'Erinnerung zur eingestellten Uhrzeit, wenn eine Gewohnheit fällig ist',
      'Eltern (Admins) können für Kinder abhaken',
    ],
    apk: true,
  },
  {
    version: '1.4',
    date: '2026-10-18',
    title: 'Push-Benachrichtigungen',
    changes: [
      'Nachricht aufs Handy bei neuen Pinnwand-Beiträgen, Terminen, zugewiesenen Aufgaben und Listeneinträgen',
      'Mehrere Listeneinträge kurz hintereinander kommen als eine Nachricht',
    ],
    apk: true,
  },
  {
    version: '1.3',
    date: '2026-10-17',
    title: 'Serientermine, wiederkehrende Aufgaben und Erinnerungen',
    changes: [
      'Bei Serienterminen nur einen Termin ändern oder löschen – oder alle folgenden',
      'Wiederkehrende Aufgaben springen beim Abhaken zum nächsten Termin',
      'Erinnerungen vor Terminen und am Fälligkeitstag eigener Aufgaben',
    ],
    apk: true,
  },
  {
    version: '1.2',
    date: '2026-10-17',
    title: 'Immer online',
    changes: [
      'FamilyConnect läuft rund um die Uhr auf einem eigenen Server – der PC muss nicht mehr an sein',
      'Server-Adresse ist in der App fest eingebaut',
      'Kein endloser Ladebildschirm mehr, wenn der Server nicht erreichbar ist',
    ],
    apk: true,
  },
  {
    version: '1.1',
    date: '2026-10-16',
    title: 'Android-App',
    changes: ['FamilyConnect als App zum Installieren auf Android-Handys'],
    apk: true,
  },
  {
    version: '1.0',
    date: '2026-10-16',
    title: 'Erste Version',
    changes: [
      'Gemeinsamer Kalender, Einkaufs- und To-do-Listen, Aufgaben, Pinnwand, Essensplan und Kontakte',
      'Familie gründen und per Einladungscode beitreten',
      'Änderungen erscheinen sofort bei allen',
    ],
  },
];

export const CURRENT_VERSION = CHANGELOG[0].version;

const SEEN_KEY = 'familyconnect.seenVersion';

export function hasUnseenChanges(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) !== CURRENT_VERSION;
  } catch {
    return false;
  }
}

export function markChangesSeen() {
  try {
    localStorage.setItem(SEEN_KEY, CURRENT_VERSION);
  } catch {
    // egal
  }
}

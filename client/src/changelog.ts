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
    version: '1.36',
    date: '2026-10-20',
    title: 'Wanddisplay',
    changes: [
      'Eigene Anzeige fürs Tablet an der Wand: Uhr, Datum, Wetter mit Hinweisen, Termine heute und morgen (mit Logos, Geburtstagen, Ferien, Urlaub), Raumklima und Pinnwand',
      'Läuft auch im Browser alter Tablets wie dem Fire 7 – ohne App und ohne Anmeldung, aktualisiert sich live',
      'Einrichten: Familie & Profil → Wanddisplay → Code erstellen, am Tablet „/wand“ öffnen und den Code eintippen; jederzeit wieder entfernbar',
      'Nachts (22–6 Uhr) wird die Anzeige dunkel',
      'Hält den Bildschirm selbst wach, wo der Browser das kann (z. B. Silk 108)',
      'Die App selbst funktioniert jetzt auch in Browsern ohne color-mix (Urlaubsfarben, Leisten)',
    ],
  },
  {
    version: '1.35',
    date: '2026-10-20',
    title: 'Wunschliste und Wetter',
    changes: [
      'Neu im Menü: Wünsche – jeder trägt ein, was er sich wünscht (mit Link, Preis und Notizen), Eltern auch für die Kinder',
      'Bei den anderen „🎁 Ich besorge das“ antippen, damit nichts doppelt gekauft wird – der Wünschende sieht das nie',
      'Bei Geburtstagen gibt es einen Sprung zur Wunschliste der Person',
      'Wetter auf der Übersicht: heute und morgen, mit Hinweisen wie „Regen ab 15 Uhr“, Regen bei einem Termin oder „Morgen früh Regen – Regenjacke bereitlegen“',
      'Den Ort fürs Wetter wählt ein Admin unter Familie & Profil',
    ],
  },
  {
    version: '1.34',
    date: '2026-10-20',
    title: 'Raumklima: mehr Thermometer werden erkannt',
    changes: [
      'Liest Werte jetzt auch über weitere Tuya-Schnittstellen und erkennt abweichende Namen der Messwerte',
      'Einstellungen → Raumklima: „Werte testen“ zeigt, was das Thermometer meldet – mit Tipp, falls gar nichts kommt',
    ],
  },
  {
    version: '1.33',
    date: '2026-10-20',
    title: 'NFC-Aufkleber direkt in der App beschreiben',
    apk: true,
    changes: [
      'Gewohnheit öffnen → „Auf NFC-Aufkleber schreiben“ → Aufkleber an die Handy-Rückseite halten → kurzes Vibrieren, fertig – „NFC Tools“ braucht es nicht mehr',
      'Klare Hinweise, wenn NFC aus ist, der Aufkleber schreibgeschützt oder zu klein ist; zu früh weggezogen → einfach nochmal dranhalten',
      'Bereits beschriebene Aufkleber lassen sich überschreiben',
    ],
  },
  {
    version: '1.32',
    date: '2026-10-20',
    title: 'Benachrichtigung bei Markierung im Termin',
    changes: [
      'Trägt dich jemand bei einem Termin ein, bekommst du eine Benachrichtigung „… hat dich bei einem Termin eingetragen“ – auch wenn du später dazugenommen wirst',
      'Die Markierung erscheint auch in der Glocke; Antippen öffnet direkt den Termin im Kalender',
    ],
  },
  {
    version: '1.31',
    date: '2026-10-20',
    title: 'Neuigkeiten-Glocke',
    changes: [
      'Oben neben dem Profil: 🔔 mit Zahl, sobald andere etwas geschrieben haben – Kommentare, Pinnwand, Beschwerden und Anfragen an dich',
      'Antippen eines Eintrags springt direkt hin; bei Kommentaren öffnet sich gleich der Termin im Kalender',
    ],
  },
  {
    version: '1.30',
    date: '2026-10-20',
    title: 'Kommentare, Geburtstage & Mitglieder ohne Handy',
    changes: [
      'Termine haben Kommentare: im Termin unten schreiben; im Kalender zeigt eine kleine Sprechblase am Tag, dass es Kommentare gibt',
      'Wer beim Termin dabei ist (oder alle), bekommt eine Nachricht zum neuen Kommentar',
      'Geburtstage: „+ Geburtstag“ für Oma, Freunde & Co., die nicht in der App sind (wird auch bei den Kontakten gespeichert)',
      'Familie & Profil (Admins): „Mitglied ohne Handy“ hinzufügen – z. B. für jüngere Kinder; später „Zugang einrichten“, wenn das Handy da ist',
    ],
  },
  {
    version: '1.29',
    date: '2026-10-20',
    title: 'Beschwerden: Foto direkt aufnehmen',
    changes: [
      'Beim Foto gibt es jetzt zwei Knöpfe: „Foto machen“ öffnet direkt die Kamera, „Auswählen“ die Galerie',
    ],
  },
  {
    version: '1.28',
    date: '2026-10-20',
    title: 'Aufgeräumter Kalender',
    changes: [
      'Termin, Urlaub, Kalender importieren und Logos stecken jetzt im „+“ oben in der Leiste',
      'Der Monat ist größer und hat mehr Platz',
      'Die Tagesliste erscheint erst, wenn du einen Tag antippst; nochmal antippen blendet sie wieder aus',
      'Logos an Terminen sind größer',
    ],
  },
  {
    version: '1.27',
    date: '2026-10-20',
    title: 'Logos im Kalender',
    changes: [
      'Kalender → „Logos“: Stichwort + Bild hinterlegen, z. B. „Fenerbahçe“ mit dem Vereinslogo',
      'Jeder Termin mit dem Stichwort im Titel zeigt das Logo klein – im Monat, in der Tagesliste und auf der Übersicht (auf dem Handy statt des Punkts)',
      'Groß-/Kleinschreibung und türkische Sonderzeichen sind egal: „Fenerbahce“ findet auch „Fenerbahçe“',
    ],
  },
  {
    version: '1.26',
    date: '2026-10-20',
    title: 'Server-Update per Knopfdruck',
    changes: [
      'Familie & Profil → Server (nur Admins): zeigt den installierten Stand und ob es auf GitHub etwas Neueres gibt',
      '„Server jetzt aktualisieren“ startet das Update sofort – ohne Computer und SSH; danach „App neu laden“',
      'Schlägt der Bau oder ein Test fehl, läuft die bisherige Version weiter und die App zeigt das an',
    ],
  },
  {
    version: '1.25',
    date: '2026-10-20',
    title: 'Kalender importieren',
    changes: [
      'Kalender: „Kalender importieren (.ics)“ – z. B. den Spielplan deines Vereins mit allen Anstoßzeiten (auch aus anderen Zeitzonen richtig umgerechnet)',
      'Eine neuere Datei mit gleichem Namen aktualisiert verschobene Termine statt sie doppelt anzulegen; ein importierter Kalender lässt sich dort auch komplett wieder entfernen',
      'Statt einer Nachricht je Termin gibt es nur eine: „… hat 34 Termine aus Fenerbahçe eingetragen“',
    ],
  },
  {
    version: '1.24',
    date: '2026-10-20',
    title: 'Urlaub im Kalender',
    changes: [
      'Kalender: „Urlaub“ eintragen – Zeitraum, wer fährt und eine Farbe; die Tage werden leicht eingefärbt wie die Schulferien',
      'Überschneiden sich Ferien und Urlaube, teilt sich das Feld: zwei Hälften, drei Drittel …',
      'Antippen eines Tages zeigt den Urlaub darunter; von dort lässt er sich ändern oder löschen',
    ],
  },
  {
    version: '1.23',
    date: '2026-10-20',
    title: 'Abfallkalender importieren',
    changes: [
      'Dienste: „Abfallkalender importieren (.ics)“ – je Abfallart ein Dienst mit den genauen Abholtagen, auch wenn Feiertage einen Termin verschieben',
      'Bei der Übernahme wählst du, wer der Reihe nach rausstellt und wann erinnert wird; ein neuer Kalender ersetzt die alten Termine',
    ],
  },
  {
    version: '1.22',
    date: '2026-10-19',
    title: 'Raumklima',
    changes: [
      'Tuya-Thermometer (Smart Life) auf der Übersicht: Temperatur und Luftfeuchtigkeit je Raum',
      'Admins wählen unter Familie & Profil → Thermometer, welche Geräte angezeigt werden, vergeben Namen und Grenzwerte',
      'Warnung per Push an die Eltern, wenn es zu warm, zu kalt, zu feucht oder zu trocken ist oder die Batterie schwächelt',
      'Geräteliste über das verknüpfte Smart-Life-Konto; notfalls lässt sich ein Thermometer über seine Device ID eintragen',
    ],
  },
  {
    version: '1.21',
    date: '2026-10-19',
    title: 'Einkaufsliste, Dienste, Geburtstage, Ferien, Abstimmungen',
    changes: [
      'Pinnwand: Abstimmungen mit 2–6 Antworten („Pizza oder Burger?“) – Ergebnis live mit Balken und wer was gewählt hat, auch auf der Übersicht',
      'Neu: „Geburtstage“ – mit Countdown, Alter, Erinnerung eine Woche vorher und am Tag; Geburtstag im Profil eintragen (Eltern auch für die Kinder), bei Kontakten ebenfalls',
      'Geschenkideen pro Person mit „gekauft“-Haken – die beschenkte Person sieht sie nicht',
      'Ferien und Feiertage eures Bundeslands im Kalender und auf der Übersicht (Bundesland wählt der Admin unter Familie & Profil)',
      'Neu: „Dienste“ im Menü – z. B. Müllabfuhr: Abholtag, Rhythmus (jede Woche, alle 2 Wochen …) und wer der Reihe nach dran ist',
      'Erinnerung am Vorabend um 19 Uhr (oder morgens) an die Person, die dran ist; abhaken und Termine tauschen per Tipp',
      'Die Übersicht zeigt die Dienste von heute und morgen',
      'Jede Familie hat jetzt eine feste „Einkaufsliste“ – immer ganz oben, kann nicht gelöscht oder umbenannt werden',
      'Einkaufslisten sortieren nach Warengruppe (Obst & Gemüse, Kühlregal, Drogerie …), Reihenfolge oder A–Z',
      'Die Warengruppe wird automatisch erkannt und lässt sich per Tipp auf den Eintrag ändern – dort auch Name und Menge bearbeiten',
    ],
  },
  {
    version: '1.20',
    date: '2026-10-19',
    title: 'Anfragen',
    changes: [
      'Neuer Bereich „Anfragen“ im Menü: „Darf ich mich mit Tim treffen?“, „Haben wir Samstag frei?“ – mit Thema, optional Tag und Uhrzeit, an eine bestimmte Person',
      'Die Person bekommt eine Push-Nachricht und antwortet mit Ja (Notiz), Nein (Begründung) oder einem Gegenvorschlag mit anderem Tag oder anderer Uhrzeit',
      'Gegenvorschläge kann man annehmen oder ablehnen, offene Anfragen zurückziehen',
      'Genehmigte Anfragen mit Termin landen per Tipp im Kalender',
      'Was auf dich wartet, zeigt die Übersicht und ein Zähler im Menü; Eltern sehen unter „Alle“ jede Anfrage',
    ],
  },
  {
    version: '1.19',
    date: '2026-10-19',
    title: 'Gewohnheiten mit NFC-Aufkleber',
    changes: [
      'Hängt ein NFC-Aufkleber an einer Gewohnheit, haken Kinder sie nur noch per Aufkleber ab – statt des Hakens sehen sie das NFC-Symbol',
      'Die Verknüpfung entsteht automatisch beim ersten Abhaken per Aufkleber und lässt sich im Bearbeiten-Fenster auch von Hand einschalten',
      'Neu: „Aufkleber lösen“ – der alte Aufkleber funktioniert dann nicht mehr und alle können wieder per Klick abhaken',
      'Eltern und Admins können weiterhin jederzeit per Klick abhaken',
    ],
  },
  {
    version: '1.18',
    date: '2026-10-19',
    title: 'Menü zum Reinziehen',
    changes: [
      'Neues Seitenmenü auf dem Handy: vom linken Rand nach rechts wischen oder oben links auf ☰ tippen',
      'Alle Bereiche an einem Ort – Gewohnheiten, Essensplan, Rezepte, Kontakte, Beschwerden, Feedback und Familie & Profil',
      'Wegwischen nach links, daneben tippen oder die Zurück-Taste schließen es wieder',
      'Offene Beschwerden an dich zeigt ein roter Punkt am Menü-Symbol',
    ],
  },
  {
    version: '1.17',
    date: '2026-10-19',
    title: 'Beschwerden',
    changes: [
      'Neue Seite „Beschwerden“ (Lautsprecher-Symbol oben): Foto und kurzer Text an eine bestimmte Person',
      'Die Person bekommt eine Push-Nachricht und einen Hinweis auf der Übersicht, kann antworten und die Beschwerde erledigen',
      'Sichtbar nur für Absender, Empfänger und Eltern – Eltern sehen unter „Alle“ jede Beschwerde',
    ],
  },
  {
    version: '1.16',
    date: '2026-10-19',
    title: 'App-Farben',
    changes: [
      'Sechs Farbschemata für die ganze App: Sonne, Ozean, Wald, Beere, Lavendel und Lagune – unter Familie & Profil, jeweils hell und dunkel',
      'Die Farbe gilt pro Person und folgt dir auf alle Geräte; auch das App-Symbol oben passt sich an',
      '„Meine Farbe“ auf 6 gut unterscheidbare Farben reduziert',
      'Eltern und Kinder sehen unter Familie & Profil nur noch ihr Profil – Einladungscode, Mitglieder und weitere Gruppen verwaltet der Admin',
    ],
  },
  {
    version: '1.15',
    date: '2026-10-19',
    title: 'Rollen: Admin, Eltern, Kinder',
    changes: [
      'Drei Rollen: Admins dürfen alles und verwalten die Familie, Eltern dürfen alle Inhalte bearbeiten, Kinder dürfen alles sehen',
      'Kinder legen Aufgaben nur für sich an und haken fremde Aufgaben nur ab, wenn sie ihnen oder allen gehören',
      'Kinder ändern nur eigene Termine und Listen; Termine anderer öffnen sich nur zum Ansehen; Gewohnheiten legen Eltern an',
      'Essensplan, Rezepte, Kontakte, Einkaufslisten und Pinnwand stehen allen offen',
      'Familie & Profil: Admins vergeben Rollen und entfernen Mitglieder; neue Mitglieder starten als Kind, bisherige Mitglieder sind jetzt Eltern',
    ],
  },
  {
    version: '1.14',
    date: '2026-10-19',
    title: 'Essensplan neu gestaltet',
    changes: [
      'Neue, übersichtliche Wochenansicht: jeder Tag eine Karte untereinander, links das Datum, rechts Frühstück, Mittag und Abend',
      'Heute ist farbig hervorgehoben, vergangene Tage sind blasser; beim Öffnen springt die Seite zum heutigen Tag',
      'Gerichte aus Rezepten zeigen ein kleines Bild; „Diese Woche“ führt aus anderen Wochen zurück',
      'Wochenauswahl mittig und ohne Wochentage: „19. Oktober – 25. Oktober“',
      'Beide Pfeile sehen gleich aus; Knöpfe bleiben nach dem Antippen nicht mehr grau hinterlegt',
    ],
  },
  {
    version: '1.13',
    date: '2026-10-18',
    title: 'Rezepte suchen und einplanen',
    changes: [
      'Essensplan: neuer Reiter „Suchen“ – Gericht eingeben und passende Rezepte mit Bild aus EatSmarter, Küchengötter und Emmi kocht einfach auswählen (in der App auch Chefkoch)',
      'Ein gewähltes Rezept aus dem Netz wird automatisch in deinen Rezepten gespeichert',
      'Rezeptseite: Knopf „In den Essensplan“ mit Tag und Mahlzeit; ein belegter Platz wird ersetzt',
    ],
  },
  {
    version: '1.12',
    date: '2026-10-18',
    title: 'Rezepte im Essensplan',
    changes: [
      'Beim Plus im Essensplan lässt sich direkt ein gespeichertes Rezept auswählen – oder wie bisher selbst etwas eintragen',
      'Aus dem Essensplan mit „Rezept öffnen“ direkt zum Rezept springen',
      '„Zutaten übernehmen“ nimmt bei Rezepten die Zutaten samt Mengen auf die Einkaufsliste',
    ],
  },
  {
    version: '1.11',
    date: '2026-10-18',
    title: 'Rezepte',
    changes: [
      'Neuer Bereich „Rezepte“ (Kochmützen-Symbol oben): Rezepte mit Bild, Zutaten und Zubereitung speichern',
      'Link einfügen, z. B. von Chefkoch, Lecker oder Kitchen Stories – Titel, Zutaten, Schritte und Bild werden automatisch übernommen',
      'Mit KI-Schlüssel auf dem Server: auch Seiten ohne Rezept-Daten und eingefügter Text werden ausgelesen',
      'Zutat antippen setzt sie auf die Einkaufsliste – oder alle fehlenden auf einmal; was schon draufsteht, ist abgehakt',
      'Portionen umrechnen: Mengen passen sich an, auch auf der Einkaufsliste',
      'Beim Kochen Arbeitsschritte antippen, um sie abzuhaken',
    ],
  },
  {
    version: '1.10',
    date: '2026-10-18',
    title: 'Updates ohne Neustart',
    changes: [
      'Kommt die App aus dem Hintergrund zurück und gibt es eine neue Version, lädt sie sich automatisch neu – Wegwischen ist nicht mehr nötig',
      'Server-Update: zu knapp eingestellte Tests behoben, die das Update auf dem Server blockiert haben',
    ],
  },
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

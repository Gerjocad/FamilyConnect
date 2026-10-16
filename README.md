# FamilyConnect

Ein Familien-Organizer nach dem Vorbild von FamilyWall: ein privater, gemeinsamer Bereich für die ganze Familie. Die App läuft im Browser auf Handy, Tablet und Desktop und lässt sich als App auf dem Startbildschirm ablegen.

## Funktionen

- **Übersicht**: Termine der nächsten 7 Tage, die eigenen offenen Aufgaben, das Essen von heute und die neuesten Beiträge
- **Kalender**: Monatsansicht mit Farbe pro Person, ganztägige und wiederkehrende Termine (täglich, wöchentlich, monatlich, jährlich), Filter nach Person
- **Listen**: beliebig viele Einkaufs- und To-do-Listen mit Mengenangaben zum gemeinsamen Abhaken
- **Aufgaben**: mit Zuständigkeit und Fälligkeitsdatum, überfällige Aufgaben werden markiert
- **Pinnwand**: Nachrichten an die ganze Familie
- **Essensplan**: Wochenplan für Frühstück, Mittag- und Abendessen; die Zutaten lassen sich per Klick auf eine Einkaufsliste übernehmen
- **Kontakte**: wichtige Nummern (Ärzte, Schule, Babysitter …) nach Kategorien, mit Anruf- und Mail-Links
- **Familien & Gruppen**: Beitritt per Einladungscode, mehrere Gruppen pro Person (z. B. Großeltern, WG), Rollen (Admin/Mitglied)
- **Live-Synchronisierung**: Änderungen erscheinen sofort bei allen Familienmitgliedern (Server-Sent Events)

## Technik

| Teil | Technik |
| --- | --- |
| Frontend (`client/`) | React 19, TypeScript, Vite, React Router |
| Backend (`server/`) | Node.js 22, Express 5, eingebautes SQLite (`node:sqlite`) |

Es wird keine externe Datenbank gebraucht, alle Daten liegen in `data/familyconnect.db`.

## Starten

Voraussetzung: Node.js ≥ 22.13

```bash
npm install

# Entwicklung: API auf :3001, Frontend mit Hot-Reload auf :5173
npm run dev

# Produktion: Frontend bauen und alles über einen Server ausliefern
npm run build
npm start            # http://localhost:3001
```

Umgebungsvariablen: `PORT` (Standard 3001) und `DATABASE_FILE` (Standard `data/familyconnect.db`).

## Tests

```bash
npm test             # API-Tests (node:test)
npm run typecheck    # TypeScript-Prüfung des Frontends
```

## API im Überblick

Alle Endpunkte liegen unter `/api` und erwarten `Authorization: Bearer <token>`.

- `POST /auth/register`, `POST /auth/login`, `POST /auth/logout`
- `GET/PATCH /me`
- `POST /families`, `POST /families/join`, `GET/PATCH /families/:id`, `POST /families/:id/leave`, `POST /families/:id/invite-code`
- `GET /families/:id/stream`: Live-Ereignisse (SSE)
- CRUD (`GET`, `POST`, `PATCH /:itemId`, `DELETE /:itemId`) für `events`, `lists`, `items`, `tasks`, `posts`, `meals`, `contacts` unter `/families/:id/…`

Die Ressourcen sind in `server/src/resources.js` deklarativ beschrieben. Für ein neues Modul reichen dort ein Eintrag und eine Tabelle in `server/src/db.js`.

## Ideen für später

- Standortteilen und Ankunftsbenachrichtigungen (braucht eine native App)
- Foto-Alben und Datei-Ablage
- Push-Benachrichtigungen und Erinnerungen
- Kalender-Synchronisierung mit Google, Outlook und iCloud (iCal)
- Budget- und Ausgabenübersicht

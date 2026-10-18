# FamilyConnect

Ein Familien-Organizer nach dem Vorbild von FamilyWall: ein privater, gemeinsamer Bereich für die ganze Familie. Die App läuft im Browser auf Handy, Tablet und Desktop und lässt sich als App auf dem Startbildschirm ablegen.

## Funktionen

- **Übersicht**: Termine der nächsten 7 Tage, die eigenen offenen Aufgaben, das Essen von heute und die neuesten Beiträge
- **Kalender**: Monatsansicht mit Farbe pro Person, ganztägige und wiederkehrende Termine (täglich, wöchentlich, monatlich, jährlich), Filter nach Person; einzelne Termine einer Serie lassen sich getrennt ändern oder löschen
- **Erinnerungen** (Android-App): vor Terminen und am Fälligkeitstag eigener Aufgaben
- **Push-Benachrichtigungen** (Android-App, optional): neue Beiträge, Termine, Aufgaben und Listeneinträge, siehe [deploy/FIREBASE.md](deploy/FIREBASE.md)
- **Listen**: beliebig viele Einkaufs- und To-do-Listen mit Mengenangaben zum gemeinsamen Abhaken
- **Rollen**: Admin (verwaltet die Familie), Eltern (bearbeiten alles), Kinder (sehen alles, ändern nur Eigenes; Essensplan, Rezepte, Kontakte, Listen und Pinnwand frei)
- **Anfragen**: „Darf ich …?“ an eine Person, mit Ja/Nein/Gegenvorschlag, Push-Nachrichten und Übernahme in den Kalender
- **Beschwerden**: Foto und kurzer Text an eine Person, mit Push-Nachricht, Antwort und „erledigt“; sichtbar für Absender, Empfänger und Eltern
- **Rezepte**: per Link von Chefkoch & Co. übernehmen oder nach einem Gericht suchen, in den Essensplan eintragen, Portionen umrechnen, Zutaten mit einem Tipp auf die Einkaufsliste setzen; optional mit KI für Seiten ohne Rezept-Daten und eingefügten Text, siehe [deploy/KI.md](deploy/KI.md)
- **Aufgaben**: mit Zuständigkeit und Fälligkeitsdatum, überfällige Aufgaben werden markiert; wiederkehrende Aufgaben springen beim Abhaken zum nächsten Termin
- **Gewohnheiten**: z. B. „Duschen alle 2 Tage“ pro Person, mit Serien, Wochenpunkten und Erinnerung; abhaken in der App oder per **NFC-Aufkleber** (`familyconnect://h/<code>`, z. B. mit der App „NFC Tools“ beschreiben). Admins können für Kinder abhaken
- **Pinnwand**: Nachrichten an die ganze Familie
- **Essensplan**: Wochenplan für Frühstück, Mittag- und Abendessen; die Zutaten lassen sich per Klick auf eine Einkaufsliste übernehmen
- **Kontakte**: wichtige Nummern (Ärzte, Schule, Babysitter …) nach Kategorien, mit Anruf- und Mail-Links
- **Familien & Gruppen**: Beitritt per Einladungscode, mehrere Gruppen pro Person (z. B. Großeltern, WG), Rollen (Admin/Mitglied)
- **Live-Synchronisierung**: Änderungen erscheinen sofort bei allen Familienmitgliedern (Server-Sent Events)

## Technik

| Teil | Technik |
| --- | --- |
| Frontend (`client/`) | React 19, TypeScript, Vite, React Router |
| Android (`client/android/`) | Capacitor 8 |
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

## Online betreiben (ohne laufenden PC)

`deploy/install.sh` richtet FamilyConnect auf einem Ubuntu-Server mit einem Befehl ein: Node.js, Dienst mit Autostart,
HTTPS über Caddy, Firewall und tägliche Backups. Wie das kostenlos bei Oracle Cloud geht, steht Schritt für Schritt
in [deploy/ORACLE.md](deploy/ORACLE.md).

## Automatische Updates

Der Server aktualisiert sich jede Nacht selbst, die Android-App lädt ihre Oberfläche vom Server, und neue APKs baut GitHub Actions und bietet sie in der App an. Einrichtung: [deploy/UPDATES.md](deploy/UPDATES.md).

## Android-App (APK)

Die Android-App ist eine Hülle um dieselbe Oberfläche (Capacitor). Sie spricht mit dem FamilyConnect-Server,
die gemeinsamen Daten liegen weiterhin dort.

1. **Server starten** auf einem Rechner, der läuft, solange die Familie die App nutzt (PC, Raspberry Pi, NAS oder ein Server im Internet):
   ```bash
   npm install && npm run build && npm start
   ```
   Beim Start zeigt der Server die Adresse im Heimnetz an, z. B. `http://192.168.178.20:3001`.
2. **APK installieren**: `FamilyConnect.apk` aufs Handy kopieren, antippen und die Installation aus unbekannten Quellen erlauben.
3. **Anmelden**: In der App die Server-Adresse eintragen (z. B. `192.168.178.20:3001`), dann registrieren oder anmelden.

Wer die App auch unterwegs nutzen will, braucht einen Server mit öffentlicher Adresse. Dafür am besten HTTPS verwenden,
z. B. über einen Reverse-Proxy wie Caddy.

APK selbst bauen (benötigt JDK 21 und das Android-SDK, `ANDROID_HOME` gesetzt):

```bash
npm run apk          # Ergebnis: client/android/app/build/outputs/apk/debug/app-debug.apk
```

Die APK ist mit einem Debug-Schlüssel signiert. Für eine Veröffentlichung im Play Store braucht man einen eigenen Release-Schlüssel.

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
- Kalender-Synchronisierung mit Google, Outlook und iCloud (iCal)
- Budget- und Ausgabenübersicht

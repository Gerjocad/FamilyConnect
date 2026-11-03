# FamilyConnect – Hinweise für Claude

Familien-App im Stil von FamilyWall, Oberfläche auf **Deutsch**, für eine Familie (Android, kein iPhone).
Antworten an den Nutzer auf Deutsch, verständlich ohne Programmierkenntnisse.

**Was offen ist und was erst auf Zuruf kommt: [BACKLOG.md](BACKLOG.md).** Wegweiser zu Anleitungen, STL-Dateien und
Bastelprojekten: [docs/README.md](docs/README.md).

## Regeln

- **Branch:** Immer auf `ccr-8a2b35be-ngz4x8` arbeiten und dorthin pushen – der Server aktualisiert sich nur von
  diesem Branch. Keinen Pull Request ohne ausdrücklichen Wunsch.
- **Keine Geheimnisse** in Repo oder Chat: Firebase-Dienstkonto, Anthropic-, Tuya- und Spotify-Schlüssel liegen nur auf
  dem Server unter `/etc/familyconnect/…`. Nie nach Passwörtern fragen. Keystore nie committen. Keine persönlichen
  Daten (Adresse, ICS-Dateien) und nicht das Fenerbahçe-Wappen (Markenrecht) committen. `config.h` der Firmware ist
  gitignored.
- Ideen aus „Gemerkt“ in BACKLOG.md erst umsetzen, wenn der Nutzer es sagt.
- Zahnputzkamera: keine Bilder speichern oder verschicken, Auswertung nur auf dem Gerät.
- Bei jeder sichtbaren Änderung oben in `client/src/changelog.ts` einen Eintrag ergänzen (`apk: true`, wenn eine neue
  Android-App nötig ist).

## Aufbau

- `server/` – Node 22, Express 5 (keine Regex-Parameter in Routen), `node:sqlite`. Tests: `npm test` im Ordner
  `server`. Live-Updates über `hub.publish(familyId, resource)` (SSE), Push über `push.notify(ids, {title, body, path})`.
  Neue Tabellen/Spalten in `db.js` (`ADDED_TABLES`, `ADDED_COLUMNS`); einfache Bereiche über `resources.js` (CRUD).
- `client/` – React 19, Vite, TypeScript, react-router 7. Prüfen: `npx tsc --noEmit -p .` und `npm run build`.
  Capacitor-Android-App in `client/android` (eigene Plugins: Geofence, LocateAuto, NfcWriter).
- `hardware/` – Musik-Box, Wandsensor, Aufsteh-Ampel: Firmware (PlatformIO, `pio`), 3D-Modelle (OpenSCAD, mit
  `xvfb-run -a openscad` exportieren), Anleitungen als PDF (Quelle z. B. `hardware/musikbox/anleitung/bauen.py`).
- `deploy/` – Installation und nächtliches Update des Servers.

## Server und Updates

- Server: Oracle-VM, `https://138-2-173-239.sslip.io`, deutsche Zeit. Update jede Nacht um 03:30 oder per Knopf in der
  App („Update“). Die Oberfläche lädt die Android-App vom Server – nur Änderungen in `client/android`, Plugins oder der
  Capacitor-Konfiguration brauchen eine neue APK (baut der GitHub-Workflow `android.yml` automatisch, die App bietet
  das Update dann an).
- Musik-Box-Firmware für das Aufspielen im Browser: `hardware/musikbox/firmware/web-firmware.sh` →
  `client/public/firmware/musikbox/musikbox.bin`.

## Testen

Playwright-Chromium ist vorinstalliert (`/opt/node-tools/node_modules/playwright`). Server für Tests:
`createApp(openDatabase(':memory:'), { staticDir: 'client/dist' }).listen(3001)`; Skripte und Screenshots in den
Scratchpad, nicht ins Repo. Was nur auf echter Hardware oder echten Handys geht, ausdrücklich als ungetestet nennen.

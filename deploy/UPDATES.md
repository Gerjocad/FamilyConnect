# Automatische Updates

FamilyConnect aktualisiert sich auf drei Wegen:

| Was | Wie | Wann |
| --- | --- | --- |
| **Server** | `familyconnect-update.timer` holt den neuesten Stand von GitHub, baut, testet und startet neu | jede Nacht ca. 3:30 Uhr |
| **Oberfläche der App** | die App lädt ihre Oberfläche direkt vom Server | sofort nach dem Server-Update |
| **Android-App (APK)** | GitHub Actions baut und signiert sie; die App zeigt „Neue App-Version – Installieren“ | nur bei Änderungen am nativen Teil |

## Einmalig: Signierschlüssel bei GitHub hinterlegen

Alle APK-Updates müssen mit demselben Schlüssel signiert sein. Er liegt als Secret bei GitHub, nie im Repository.

1. <https://github.com/Gerjocad/FamilyConnect/settings/secrets/actions> öffnen
2. **„New repository secret“**
   - Name: `ANDROID_KEYSTORE_BASE64`
   - Secret: der lange Text aus der Schlüsseldatei
3. Noch einmal **„New repository secret“**
   - Name: `ANDROID_KEYSTORE_PASSWORD`
   - Secret: das Passwort aus der Schlüsseldatei
4. Unter **Actions → „Android-App“ → „Run workflow“** den ersten Build starten. Nach ca. 5 Minuten erscheint unter **Releases** „FamilyConnect 2.x“.

Die Schlüsseldatei zusätzlich sicher aufbewahren (z. B. Passwort-Manager). Ohne sie können keine Updates mehr gebaut werden, die sich über die installierte App installieren lassen.

## Server

- Protokoll der Updates: `journalctl -u familyconnect-update`
- Sofort aktualisieren: in der App unter **Familie & Profil → Server → „Server jetzt aktualisieren“** (nur Admins)
  oder per SSH `sudo systemctl start familyconnect-update`
- So funktioniert der Knopf: Die App legt `/var/lib/familyconnect/update-request` an,
  `familyconnect-update.path` (systemd) startet daraufhin das Update als Root. Der App-Dienst selbst bekommt
  keine Root-Rechte. Den Fortschritt schreibt `deploy/update.sh` nach `/var/lib/familyconnect/update-status.json`.
- Eingerichtet wird der Knopf automatisch beim ersten Update nach dieser Änderung (Installationsskript läuft dann neu).
- Schlägt der Bau oder ein Test fehl, bleibt die bisherige Version in Betrieb.

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
- Sofort aktualisieren: `sudo systemctl start familyconnect-update`
- Schlägt der Bau oder ein Test fehl, bleibt die bisherige Version in Betrieb.

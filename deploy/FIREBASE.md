# Push-Benachrichtigungen einrichten (Firebase)

Push-Benachrichtigungen laufen bei Android über Firebase Cloud Messaging von Google. Das ist kostenlos. Einmalig braucht es zwei Dateien:

| Datei | Wofür | Geheim? |
| --- | --- | --- |
| `google-services.json` | wird in die Android-App eingebaut | nein (steckt in jeder App) |
| Dienstkonto-Schlüssel (`…-firebase-adminsdk-….json`) | erlaubt dem Server, Nachrichten zu verschicken | **ja – niemandem schicken, nur auf den Server kopieren** |

## 1. Firebase-Projekt anlegen

1. <https://console.firebase.google.com> öffnen und mit einem Google-Konto anmelden.
2. **„Projekt erstellen“** → Name `FamilyConnect` → Google Analytics **deaktivieren** → **Projekt erstellen**.

## 2. Android-App hinzufügen → `google-services.json`

1. In der Projektübersicht auf das **Android-Symbol** klicken („App hinzufügen“).
2. **Android-Paketname:** `de.familyconnect.app` (genau so), Spitzname beliebig → **App registrieren**.
3. **`google-services.json` herunterladen**. Die restlichen Schritte des Assistenten kannst du mit „Weiter“ überspringen.
4. Die Datei nach `client/android/app/google-services.json` legen (oder Claude geben, um die APK zu bauen).
   Der Build erkennt die Datei automatisch und schaltet Push in der App ein.

## 3. Dienstkonto-Schlüssel für den Server

1. Zahnrad oben links → **Projekteinstellungen** → Reiter **Dienstkonten**.
2. **„Neuen privaten Schlüssel generieren“** → bestätigen. Es wird eine JSON-Datei heruntergeladen.
3. Datei auf den Server kopieren (PowerShell, Pfade anpassen):
   ```powershell
   scp -i $HOME\Downloads\ssh-key.key $HOME\Downloads\familyconnect-xxxxx-firebase-adminsdk-xxxxx.json ubuntu@138.2.173.239:firebase.json
   ```
4. Auf dem Server an die richtige Stelle schieben und FamilyConnect aktualisieren:
   ```bash
   ssh -i $HOME\Downloads\ssh-key.key ubuntu@138.2.173.239
   sudo mkdir -p /etc/familyconnect && sudo mv ~/firebase.json /etc/familyconnect/firebase.json
   curl -fsSL https://raw.githubusercontent.com/Gerjocad/FamilyConnect/ccr-8a2b35be-ngz4x8/deploy/install.sh | sudo bash
   ```
5. Prüfen: `journalctl -u familyconnect -n 5` sollte „Push-Benachrichtigungen: aktiv“ zeigen.

## Was verschickt wird

- neuer Beitrag auf der Pinnwand → an alle anderen
- neuer Termin → an die Beteiligten (oder alle, wenn niemand ausgewählt ist)
- Aufgabe zugewiesen → an die zuständige Person
- neue Listeneinträge → an alle anderen, mehrere Einträge kurz hintereinander werden zu einer Nachricht gebündelt

Wer etwas selbst einträgt, bekommt dazu keine Nachricht.

# Sicherung in Google Drive

Der Server sichert jede Nacht um ca. 3 Uhr die Datenbank (alle Termine, Listen, Rezepte, Finanzen …) auf sich selbst
(`/var/backups/familyconnect`, 14 Tage). Damit die Daten auch dann sicher sind, wenn der Server einmal verloren geht,
lädt er die Sicherung zusätzlich in **dein Google Drive** hoch – sobald das hier einmal eingerichtet ist (ca. 10 Minuten).

In Google Drive entsteht der Ordner **FamilyConnect-Sicherung**:

| Ordner | Inhalt |
| --- | --- |
| `datenbank/` | eine Datei pro Tag, z. B. `familyconnect-2026-11-16.db.gz` – die letzten 30 Tage |
| `fotos/` | alle hochgeladenen Bilder (Pinnwand, Beschwerden, Rezepte …) |

Der Server bekommt dabei **nur Zugriff auf diesen einen Ordner** (Google-Berechtigung „nur selbst angelegte Dateien“),
nicht auf den Rest deines Drives. Dein Google-Passwort bekommt er nie.

> **Wichtig:** Der Zugangsschlüssel, der unten entsteht, gehört **nur auf den Server** – nie in einen Chat, eine
> Nachricht oder ins Git-Repository.

## 1. rclone auf dem PC installieren

In **PowerShell**:

```powershell
winget install Rclone.Rclone
```

Danach PowerShell schließen und **neu öffnen**.

## 2. Auf dem Server einrichten

1. In der App einmal **„Update“** drücken (Familie & Profil → App & Server) und warten, bis es fertig ist – dabei
   wird rclone auch auf dem Server installiert.
2. Mit dem Server verbinden (oder `Oracle-Server.bat` doppelklicken):
   ```powershell
   ssh -i "$HOME\Documents\KeY\ssh-key-2026-10-17.key" ubuntu@138.2.173.239
   ```
3. Einrichtung starten:
   ```bash
   sudo rclone config --config /etc/familyconnect/rclone.conf
   ```
4. Die Fragen so beantworten (jeweils eintippen und `Enter`):

   | Frage | Antwort |
   | --- | --- |
   | `e/n/d/r/c/s/q>` | `n` (neues Ziel) |
   | `name>` | `gdrive` |
   | `Storage>` | `drive` |
   | `client_id>` | leer lassen, nur `Enter` |
   | `client_secret>` | leer lassen, nur `Enter` |
   | `scope>` | `drive.file` |
   | `service_account_file>` | leer lassen, nur `Enter` |
   | `Edit advanced config?` | `n` |
   | `Use web browser to automatically authenticate…?` | `n` |

5. Jetzt zeigt der Server eine Zeile wie
   `rclone authorize "drive" "eyJzY29wZSI6…"` – diese **ganze Zeile** markieren und kopieren
   (im SSH-Fenster: markieren, dann Rechtsklick). Das Fenster offen lassen.

## 3. Mit Google anmelden (auf dem PC)

1. Ein **zweites** PowerShell-Fenster öffnen, die kopierte Zeile einfügen und `Enter` drücken.
2. Der Browser öffnet sich: mit deinem Google-Konto anmelden und **„Zulassen“** klicken.
3. Zurück in PowerShell steht jetzt ein langer Text zwischen
   `Paste the following into your remote machine --->` und `<---End paste`.
   Diesen Text (ohne die Pfeil-Zeilen) kopieren.

## 4. Zurück auf dem Server

1. Im SSH-Fenster bei `config_token>` den Text einfügen und `Enter`.
2. `Configure this as a Shared Drive?` → `n`
3. `Keep this "gdrive" remote?` → `y`, danach `q` zum Beenden.
4. Datei schützen:
   ```bash
   sudo chmod 600 /etc/familyconnect/rclone.conf
   ```

## 5. Testen

In der App unter **Familie & Profil → App & Server → Sicherung** auf **„Jetzt sichern“** tippen. Nach ein paar
Sekunden steht dort „Letzte Sicherung in Google Drive: heute …“, und in Google Drive erscheint der Ordner
**FamilyConnect-Sicherung**.

Alternativ auf dem Server:
```bash
sudo systemctl start familyconnect-backup && cat /var/lib/familyconnect/backup-status.json
```

Klappt die Sicherung später einmal nicht (z. B. weil Google die Erlaubnis zurückgezogen hat), bekommen Admins eine
Push-Nachricht. Dann die Schritte 2–4 einfach wiederholen (bei der ersten Frage `e` für „bearbeiten“ statt `n`).

## Wiederherstellen

Am besten zusammen mit Claude machen. Kurz gesagt:

1. In Google Drive die gewünschte `familyconnect-JJJJ-MM-TT.db.gz` herunterladen und auf den Server kopieren:
   ```powershell
   scp -i "$HOME\Documents\KeY\ssh-key-2026-10-17.key" familyconnect-2026-11-16.db.gz ubuntu@138.2.173.239:
   ```
2. Auf dem Server:
   ```bash
   sudo systemctl stop familyconnect
   gunzip familyconnect-2026-11-16.db.gz
   sudo cp /var/lib/familyconnect/familyconnect.db /var/lib/familyconnect/familyconnect.db.vorher
   sudo install -o familyconnect -g familyconnect -m 640 familyconnect-2026-11-16.db /var/lib/familyconnect/familyconnect.db
   sudo rclone --config /etc/familyconnect/rclone.conf copy gdrive:FamilyConnect-Sicherung/fotos /var/lib/familyconnect/uploads
   sudo chown -R familyconnect: /var/lib/familyconnect/uploads
   sudo systemctl start familyconnect
   ```

# Wegweiser – wo finde ich was?

Alles Wichtige zu FamilyConnect auf einen Blick. Neue Anleitungen und Bastelprojekte kommen immer hier dazu.

## 📄 Anleitungen (PDF)

| Anleitung | Wofür |
| --- | --- |
| [Musik-Box](../hardware/musikbox/Anleitung-Musikbox.pdf) | NFC-Karten-Box mit ESP32-S3: Teile, Verkabelung, 3D-Druck, Firmware |
| [Wandsensor](../hardware/wandsensor/Anleitung-Wandsensor.pdf) | Radar + Lichtsensor fürs Wanddisplay: weckt das Display, Dark Mode bei Dunkelheit |
| [Oracle-Server](anleitungen/Anleitung-Oracle-Server.pdf) | Allgemein: eine Web-Plattform auf einem kostenlosen Oracle-Server betreiben (ohne Namen) |

## 🛠️ Bastelprojekte (Ordner mit allem Drum und Dran)

| Projekt | Inhalt |
| --- | --- |
| [hardware/musikbox](../hardware/musikbox/) | Anleitung, STL-Dateien (Gehäuse im Lautsprecher-Look oder schlicht, Boden, Karten, Knopf, Tastenkappe), OpenSCAD-Modell, Firmware |
| [hardware/wandsensor](../hardware/wandsensor/) | Anleitung, STL-Dateien (Gehäuse + Rückwand für ESP32-C3 oder -S3), OpenSCAD-Modell, Firmware |

## 🧊 3D-Druck-Dateien (STL)

**Musik-Box** – Ordner [hardware/musikbox/3d](../hardware/musikbox/3d/), Modell zum Anpassen: [musikbox.scad](../hardware/musikbox/3d/musikbox.scad)

| Datei | Teil | Anzahl |
| --- | --- | --- |
| [gehaeuse.stl](../hardware/musikbox/3d/gehaeuse.stl) | Gehäuse im Lautsprecher-Look (kopfüber drucken) | 1 |
| [gehaeuse_schlicht.stl](../hardware/musikbox/3d/gehaeuse_schlicht.stl) | … oder schlicht ohne Verzierung | (1) |
| [boden.stl](../hardware/musikbox/3d/boden.stl) | Boden mit ESP32-Halter | 1 |
| [karte_vorne.stl](../hardware/musikbox/3d/karte_vorne.stl) | Karte, vordere Hälfte | 1 pro Karte |
| [karte_hinten.stl](../hardware/musikbox/3d/karte_hinten.stl) | Karte, hintere Hälfte (Mulde für den NFC-Aufkleber) | 1 pro Karte |
| [drehknopf.stl](../hardware/musikbox/3d/drehknopf.stl) | Lautstärke-Knopf | 1 |
| [tastenkappe.stl](../hardware/musikbox/3d/tastenkappe.stl) | Tastenkappe vor/zurück | 2 |

**Wandsensor** – Ordner [hardware/wandsensor/3d/stl](../hardware/wandsensor/3d/stl/), Modell zum Anpassen: [wandsensor.scad](../hardware/wandsensor/3d/wandsensor.scad)

| Datei | Teil |
| --- | --- |
| [gehaeuse_c3.stl](../hardware/wandsensor/3d/stl/gehaeuse_c3.stl) | Gehäuse für ESP32-C3 SuperMini (Vorderseite nach unten drucken) |
| [rueckwand_c3.stl](../hardware/wandsensor/3d/stl/rueckwand_c3.stl) | Rückwand mit C3-Halter und Schlüssellöchern |
| [gehaeuse_s3.stl](../hardware/wandsensor/3d/stl/gehaeuse_s3.stl) | Gehäuse für ESP32-S3-DevKitC-1 (größer) |
| [rueckwand_s3.stl](../hardware/wandsensor/3d/stl/rueckwand_s3.stl) | Rückwand für den S3 |

Auf GitHub eine STL anklicken zeigt sie in 3D; rechts oben „Download“ lädt sie für den Slicer herunter.

## ⚙️ Server einrichten (Schritt für Schritt)

| Thema | Datei |
| --- | --- |
| Server bei Oracle Cloud (konkret für FamilyConnect) | [deploy/ORACLE.md](../deploy/ORACLE.md) |
| Automatische Updates (nachts 3:30, Update-Knopf) | [deploy/UPDATES.md](../deploy/UPDATES.md) |
| Push-Benachrichtigungen (Firebase) | [deploy/FIREBASE.md](../deploy/FIREBASE.md) |
| Spotify für Musik und Musik-Box | [deploy/SPOTIFY.md](../deploy/SPOTIFY.md) |
| Tuya-Thermometer (Raumklima) | [deploy/TUYA.md](../deploy/TUYA.md) |
| Rezept-Import per KI | [deploy/KI.md](../deploy/KI.md) |

Geheime Schlüssel gehören nie in diese Dateien oder in den Chat – nur auf den Server unter `/etc/familyconnect/`.

## 💡 Ideen und Pläne

[BACKLOG.md](../BACKLOG.md) – was gemerkt ist („später“), was auf Rückmeldung wartet und was schon erledigt ist.

## 🆕 Was hat sich wann geändert?

In der App unter **Familie & Profil → Neuigkeiten** (jede Version mit Datum). Im Code: [client/src/changelog.ts](../client/src/changelog.ts).

## 🔎 Tipps zum Suchen

- **Auf GitHub:** im Repository oben links den Branch `ccr-8a2b35be-ngz4x8` wählen, dann `docs/README.md` öffnen – das ist diese Seite. Mit der Taste `t` lassen sich Dateien nach Namen suchen.
- **Im Claude-Chat:** Für ein neues großes Thema am besten einen neuen Chat beginnen und ihm einen Namen geben (z. B. „Musik-Box“) – dann findet man es in der Chat-Liste schneller wieder als in einem langen Verlauf.

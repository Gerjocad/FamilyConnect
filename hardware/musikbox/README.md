# Musik-Box mit Karten

Karte mit NFC-Aufkleber in den Schlitz stecken → Spotify-Playlist läuft auf dem Lautsprecher (über FamilyConnect).
Karte heraus → Pause, wieder hinein → weiter. Drehknopf = Lautstärke (drücken = Pause/Weiter), zwei Tasten = Titel zurück/vor.

**Bauanleitung mit Teileliste, Verkabelungsplan und allen Schritten:** [Anleitung-Musikbox.pdf](Anleitung-Musikbox.pdf)
(Quelle: `anleitung/bauen.py`, Bilder aus `anleitung/bilder.scad` – nach Änderungen `python3 bauen.py` im Ordner `anleitung/`)

| Ordner | Inhalt |
| --- | --- |
| `3d/` | `musikbox.scad` (OpenSCAD, alle Maße oben anpassbar) und fertige STL-Dateien: Gehäuse im Lautsprecher-Look (`gehaeuse.stl`) oder ohne Verzierung (`gehaeuse_schlicht.stl`), Boden, Karte vorne/hinten, Tastenkappe, `taster_adapter.stl` (für kleine 7,6-mm-Taster), Drehknopf, `knopf_test.stl` (nur die Nabe zum Ausprobieren) |
| `firmware/` | PlatformIO-Projekt für den ESP32-S3-DevKitC-1 (RC522, Drehgeber, 2 Tasten). Aufspielen und Einrichten am einfachsten in der App: **Musik → Musik-Box → „Per USB einrichten“** (Chrome/Edge am PC). `web-firmware.sh` baut die Datei dafür (`client/public/firmware/musikbox/`); `include/config.h` ist nur noch optional |

## Kurz: Verkabelung

| Bauteil | Anschluss | ESP32-S3 |
| --- | --- | --- |
| RC522 | 3.3V / GND / RST / SDA / MOSI / SCK / MISO | 3V3 / GND / 9 / 10 / 11 / 12 / 13 |
| Drehgeber EC11 | A / B / C / SW1 / SW2 | 4 / 5 / GND / 6 / GND |
| Drehgeber auf runder Platine (Modul) | 5V / GND / S1 / S2 / KEY | **3V3** (nicht 5V!) / GND / 4 / 5 / 6 |
| Taste zurück | Pin 1 / Pin 2 (diagonal) | 15 / GND |
| Taste vor | Pin 1 / Pin 2 (diagonal) | 16 / GND |

Der RC522 verträgt nur **3,3 V**.

**Drehgeber-Modul mit runder Platine:** Der Pin „5V“ versorgt nur die Pull-up-Widerstände auf der Platine – an **3V3**
anschließen, sonst bekommen die ESP32-Eingänge 5 V. Eingebaut wird es wie der nackte EC11: Gewinde von innen durch das
Loch vorne, Mutter außen. Die Platine (Ø ca. 25 mm) passt hinter die Front. Die Lötpins **nach unten** drehen, dann laufen
die Kabel unter dem ESP32 durch statt gegen ihn zu stoßen. Sitzt die kleine Metallnase am Gewinde dann nicht in der
Kerbe, die Nase mit einer Zange abbiegen – die Mutter hält den Drehgeber allein.

**Kleine Taster (7,6 × 7,6 mm):** Die Halter im Gehäuse sind für 12-mm-Taster. `taster_adapter.stl` (2×) in den
Halter stecken, den Taster mit den Beinchen zur offenen Seite hineinlegen und nach vorn schieben, bis der Stößel die
Tastenkappe gerade berührt (er klickt noch nicht) – dann mit Heißkleber festsetzen. Die Kabel an zwei **diagonal**
gegenüberliegende Beinchen löten.

**Drehknopf:** Der Knopf ist für die runde, geriffelte Welle (Ø 5,9 mm) gemacht – sechs Klemmrippen drücken sich beim
Aufstecken in die Riffelung. Am besten zuerst `knopf_test.stl` drucken (wenige Minuten): Sitzt es zu stramm, in
`musikbox.scad` `welle_klemm` kleiner stellen (z. B. 0.1), wackelt es, größer (z. B. 0.3); für eine abgeflachte
D-Welle `welle = "d"`.

## Karten

64 × 64 × 2 mm aus zwei Hälften, NFC-Aufkleber **NTAG213/215** (Ø 25 mm) in der Mitte. Beschreiben in der App unter
**Musik → Karte → „Auf NFC-Aufkleber schreiben“**; Cover in Originalgröße unter **Musik → „Cover für die Karten ausdrucken“**.
Dieselben Karten funktionieren auch, wenn man nur das Handy dranhält.

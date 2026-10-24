# Musik-Box mit Karten

Karte mit NFC-Aufkleber in den Schlitz stecken → Spotify-Playlist läuft auf dem Lautsprecher (über FamilyConnect).
Karte heraus → Pause, wieder hinein → weiter. Drehknopf = Lautstärke (drücken = Pause/Weiter), zwei Tasten = Titel zurück/vor.

**Bauanleitung mit Teileliste, Verkabelungsplan und allen Schritten:** [Anleitung-Musikbox.pdf](Anleitung-Musikbox.pdf)

| Ordner | Inhalt |
| --- | --- |
| `3d/` | `musikbox.scad` (OpenSCAD, alle Maße oben anpassbar) und fertige STL-Dateien: Gehäuse, Boden, Karte vorne/hinten, Tastenkappe, Drehknopf |
| `firmware/` | PlatformIO-Projekt für den ESP32-S3-DevKitC-1 (RC522, EC11, 2 Tasten). `include/config.example.h` → `include/config.h` kopieren und ausfüllen |

## Kurz: Verkabelung

| Bauteil | Anschluss | ESP32-S3 |
| --- | --- | --- |
| RC522 | 3.3V / GND / RST / SDA / MOSI / SCK / MISO | 3V3 / GND / 9 / 10 / 11 / 12 / 13 |
| Drehgeber EC11 | A / B / C / SW1 / SW2 | 4 / 5 / GND / 6 / GND |
| Taste zurück | Pin 1 / Pin 2 (diagonal) | 15 / GND |
| Taste vor | Pin 1 / Pin 2 (diagonal) | 16 / GND |

Der RC522 verträgt nur **3,3 V**.

## Karten

64 × 64 × 2 mm aus zwei Hälften, NFC-Aufkleber **NTAG213/215** (Ø 25 mm) in der Mitte. Beschreiben in der App unter
**Musik → Karte → „Auf NFC-Aufkleber schreiben“**; Cover in Originalgröße unter **Musik → „Cover für die Karten ausdrucken“**.
Dieselben Karten funktionieren auch, wenn man nur das Handy dranhält.

# Wandsensor fürs Wanddisplay

Kleiner ESP32 neben dem Fire-Tablet: Kommt jemand, geht die Wandanzeige (`/wand`) an. Ist niemand da, wird sie nach der
eingestellten Zeit schwarz. Wird es dunkel, schaltet sie in den Dark Mode.

**Bauanleitung mit Teileliste, Verkabelungsplan und allen Schritten:** [Anleitung-Wandsensor.pdf](Anleitung-Wandsensor.pdf)

| Ordner | Inhalt |
| --- | --- |
| `3d/` | `wandsensor.scad` (OpenSCAD, Parameter `board` = c3/s3, `sensor` = radar/pir) und fertige STL-Dateien |
| `firmware/` | PlatformIO-Projekt, Umgebungen `c3` (ESP32-C3 SuperMini) und `s3` (ESP32-S3-DevKitC-1). `include/config.example.h` → `include/config.h` |

## Kurz: Verkabelung

| Sensor-Pin | ESP32-C3 SuperMini | ESP32-S3-DevKitC-1 |
| --- | --- | --- |
| BH1750 VCC / GND / SDA / SCL | 3V3 / GND / 6 / 7 | 3V3 / GND / 8 / 9 |
| Radar HLK-LD2402 VCC / GND / OUT | 3V3 / GND / 3 | 3V3 / GND / 4 |
| oder PIR HC-SR501 VCC / GND / OUT | 5V / GND / 3 | 5V / GND / 4 |

## Server

Der Sensor meldet sich mit dem Code des Wanddisplays: `POST /api/wall/<code>/sensor {"present": true, "lux": 12.5}`.
Ruhezeit und Dark-Mode-Schwelle stellt man in der App unter **Familie & Profil → Geräte → Wanddisplay** ein.

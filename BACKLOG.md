# Geplant – noch nicht umgesetzt

Ideen und abgestimmte Vorhaben, die erst auf Zuruf umgesetzt werden.

## Für morgen

- **Tuya-Thermometer prüfen**: nach dem Update meldet sich der Nutzer, ob die Geräteliste jetzt kommt
  (sonst Device ID von Hand eintragen bzw. Fehlermeldung ansehen).

## Später (abgestimmt, noch nicht umsetzen)

- **ESP32-S3-Familien-Station** (Idee 1 „gefällt zum Teil, ausbaufähig“ – noch nicht umsetzen, erst weiter
  ausdenken): rundes GC9A01-Display mit WS2812B-Ring (16 LEDs) im Flur/Küche; RC522-Anhänger je Person
  („bin da/weg“, Gewohnheiten/Dienste abhaken auch ohne Handy), Begrüßung mit Terminen des Tages; Ring in
  Mülltonnenfarbe am Vorabend + Omron-Taster „rausgestellt“; Radar LD2402 weckt die Anzeige, BH1750 dimmt,
  EC11 zum Blättern. Technik: Geräte-Code wie beim Wanddisplay, aber mit festgelegten Rechten; Firmware
  PlatformIO.
  Vorhandene Teile: ESP32-S3-DevKitC-1 (WROOM-1), TFT 1,8" ST7735S, rund 1,28" GC9A01, Streifen 2,25"
  ST7789P3 76×284, OLED 0,96" SSD1306, RC522, PIR HC-SR501, Radar HLK-LD2402, 2× BH1750, EC11, KY-037,
  Omron 12 mm, TTP223, MCP23017, OV7670 (ohne FIFO, eher nicht nutzen), WS2812B 8×8 + Ring 16, SMD-LEDs
  3528 grün/weiß, SMD-Widerstände 1206 (20/51/100 Ω), IR-Handwisch-Schalter, FTS-06, 3-Stufen-Drehschalter
  6 A, N20-Motor.

- **Punkte & Belohnungen** – „klingt gut, aber noch nicht“: Punkte für Aufgaben/Gewohnheiten/Dienste,
  Belohnungen einlösen über Anfragen, Wochen-Rangliste
- **Taschengeld-Konto** – Idee muss noch ausgearbeitet werden (Kontostand je Kind, wöchentliche
  Gutschrift, Ausgaben, evtl. Verbindung zu Punkten)
- **Wochenplan-Assistent** für den Essensplan – noch nicht
- **Familien-Dokumente** (Impfpass, Versicherungskarten, WLAN …) – nur wenn es wirklich sicher ist:
  Verschlüsselung der Dateien auf dem Server, Zugriff nur für Eltern, PIN/zweite Bestätigung, kein
  Vorschaubild im Cache
- **Müllabfuhr automatisch** aus dem ICS-Kalender der Stadt – erstmal nicht (Dienste gibt es manuell)
- **Barcode-Scanner** für die Einkaufsliste – erstmal nicht
- **Standort teilen** – erstmal nicht

## Erledigt aus der Ideenliste

- Feste Einkaufsliste mit Warengruppen, Dienste mit Rotation (Müllabfuhr), Geburtstage mit
  Geschenkideen, Abstimmungen auf der Pinnwand, Ferien & Feiertage nach Bundesland, Tuya-Raumklima,
  Server-Update per Knopfdruck in der App, NFC-Aufkleber direkt in der App beschreiben,
  Wunschliste, Wetter auf der Übersicht, Wanddisplay für das Fire 7 (Fire OS 5.7 → eigene Browser-Seite /wand)

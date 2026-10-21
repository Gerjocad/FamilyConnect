# Geplant – noch nicht umgesetzt

Ideen und abgestimmte Vorhaben, die erst auf Zuruf umgesetzt werden.

## Offen – wartet auf Rückmeldung

- **Tuya-Thermometer**: Werte kommen inzwischen an (Wanddisplay zeigt 19,1 °C / 70 %). Falls in der App
  noch etwas fehlt: „Werte testen“ in den Einstellungen ansehen.

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
- **ESP32-Aufsteh-Ampel** für die Kinder (gefällt – merken, noch nicht umsetzen): WS2812B-Ring rot = noch
  schlafen, grün = aufstehen erlaubt; rundes GC9A01 mit Mond/Sonne; BH1750 dimmt nachts. Zeiten je Kind in
  der App einstellbar (Wochenende anders).
- **ESP32-„Bitte lüften“-Lampe** (gefällt – merken, noch nicht umsetzen): WS2812B-Ring im Zimmer leuchtet
  blau, solange die Luftfeuchte des Tuya-Thermometers über dem Grenzwert liegt (Werte/Grenzen kommen aus
  dem Raumklima der App), geht nach dem Lüften wieder aus.

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
- **Standort-Abfrage** – nur geplant, noch nicht umsetzen. Plan:
  - Stufe 1 (empfohlen): „📍 Wo bist du?“ bei einer Person → Push → Person tippt „Standort senden“ (oder
    „Nicht jetzt“) → einmaliger GPS-Standort an den Fragenden, Anzeige mit Uhrzeit, Genauigkeit und Link
    zu Google Maps; nach 24 h automatisch gelöscht. Braucht neue APK (Standort-Berechtigung), geht auch im
    Browser. Zusätzlich „Ich bin angekommen“-Knopf (Standort ungefragt an die Familie senden).
  - Stufe 2 (optional, für Kinder): Antwort automatisch ohne Antippen – eigener Android-Teil, der die
    Push-Nachricht im Hintergrund annimmt und den Standort schickt; Kind sieht jedes Mal „Mama hat deinen
    Standort abgerufen“. Mehr Aufwand, Berechtigung „Immer erlauben“.
  - Bewusst nicht: dauerhaftes Live-Tracking wie Life360 (Akku, Privatsphäre).
  - Orte mit „angekommen/losgegangen“ sind umgesetzt (v1.40) – offen bleibt nur die „Wo bist du?“-Abfrage.
  - Offene Fragen: Wer darf wen fragen bzw. wessen Orte werden gemeldet (Eltern → Kinder, Erwachsene
    untereinander?), Stufe 1 oder gleich 2. Kein iPhone in der Familie (nur Android) – geklärt.

## Erledigt aus der Ideenliste

- Feste Einkaufsliste mit Warengruppen, Dienste mit Rotation (Müllabfuhr), Geburtstage mit
  Geschenkideen, Abstimmungen auf der Pinnwand, Ferien & Feiertage nach Bundesland, Tuya-Raumklima,
  Server-Update per Knopfdruck in der App, NFC-Aufkleber direkt in der App beschreiben,
  Wunschliste, Wetter auf der Übersicht, Wanddisplay für das Fire 7 (Fire OS 5.7 → eigene Browser-Seite /wand),
  Kommentare bei Beschwerden, Ausgeliehen (Bücher mit Rückgabedatum), Orte (angekommen/losgegangen),
  aufgeräumte Seite Familie & Profil

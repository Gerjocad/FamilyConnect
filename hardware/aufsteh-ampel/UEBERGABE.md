# Übergabe: Aufsteh-Ampel (für einen eigenen Chat)

Stand: 05.11.2026. Diese Datei fasst zusammen, was zur Aufsteh-Ampel besprochen und gebaut wurde, damit ein neuer
Claude-Chat direkt weitermachen kann. Allgemeine Regeln des Projekts: [CLAUDE.md](../../CLAUDE.md).

## Worum es geht

Ein Licht am Bett der Kinder zeigt ohne Uhr, ob sie noch schlafen sollen oder aufstehen dürfen:
🌙 roter Mond (Nacht) → 🌅 gelber Sonnenaufgang (gleich) → ☀️ ganze Sonne (aufstehen).
Gebaut wird es aus einem **ESP32** und einer **WS2812B-Matrix 8×8**.

## Was es schon gibt

- **Firmware „erster Test“** in [firmware/](firmware/) (PlatformIO; Umgebungen `s3` für ESP32-S3-DevKitC-1 und `c3`
  für ESP32-C3 SuperMini): zeigt die drei Bilder im Kreis, BOOT-Taste springt weiter. **Ohne WLAN und ohne App.**
  Einstellungen (Helligkeit, Dauer, Zickzack, Spiegeln, grüne Sonne) in `firmware/include/einstellungen.h`, die Bilder
  als 8 Textzeilen oben in `firmware/src/main.cpp`.
- **Verkabelung** (3 Kabel: 5V, GND, DIN an GPIO 4; optional 330 Ω und 1000 µF/16 V): [README.md](README.md),
  [verkabelung.png](verkabelung.png), Vorschau der Bilder: [bilder.png](bilder.png).
- **Kompiliert** für beide Boards, auf echter Hardware **noch nicht getestet** – der Nutzer baut sie später.
- **Großer Plan** mit App-Anbindung (Zeiten je Kind, Ferien = Wochenende, „Ich bin wach“ per Berührung,
  Helligkeitssensor, Gehäuse mit Streuscheibe): [docs/plaene/aufsteh-ampel.md](../../docs/plaene/aufsteh-ampel.md).

## Entscheidungen des Nutzers

- Zuerst **nur ESP32 + 8×8-Matrix** verbinden: roter Mond, gelber Sonnenaufgang, ganze Sonne. („Ok, ich baue es später.“)
- **App-Einbindung erst, wenn die Hardware gebaut ist** – vorher nicht umsetzen.
- Vorhanden: WS2812B 8×8 (feste Platine 65,5 × 66,5 mm, Löcher Ø 2,5 im Abstand 49 × 25 mm), BH1750 (zweiter), TTP223, ESP32-S3-DevKitC-1 (Nachbau, Platine 56,7 × 28,2 mm).
  Einkaufsliste: [docs/einkaufsliste.md](../../docs/einkaufsliste.md). Der vorhandene ESP32-S3 steckt inzwischen in der
  Musik-Box – für die Ampel wird ein ESP32-C3 SuperMini gekauft (Entscheidung 07.11.).
- **Noch offen** (im Plan unter „Noch zu klären“): für welches Kind bzw. wie viele Ampeln, Zeiten Mo–Fr/Wochenende,
  nachts roter Mond oder ganz aus, „Ich bin wach“ mit Punkten verbinden, Gehäuse schlicht oder mit Motiv.

## Nächste Schritte (wenn der Nutzer so weit ist)

1. Matrix nach README anschließen, Firmware aufspielen, Bilder prüfen (ggf. `ZICKZACK`, `SPIEGELN`, `KOPFUEBER`).
2. Gehäuse ist modelliert (07.11.): [3d/](3d/) – Würfel 76 × 76 × 32 mm, Streuscheibe 0,8 mm, Raster mit 64 Kammern,
   ESP32-C3-Halter, Platz für TTP223/BH1750. Erst `raster_test.stl` drucken und den LED-Abstand prüfen.
3. Erst danach die App-Anbindung nach dem Plan: Server `GET /api/wake-light/<code>`, Geräte-Code wie bei Wanddisplay
   und Musik-Box, Einrichten per USB im Browser wie bei der Musik-Box (`client/src/musicBoxSerial.ts`,
   `client/src/pages/MusicBoxSetupPage.tsx`).

## Hinweise für die Arbeit

- Branch `ccr-8a2b35be-ngz4x8`, Server-Update nachts 03:30 oder per Knopf in der App.
- Nur in `hardware/aufsteh-ampel/` und `docs/plaene/aufsteh-ampel.md` arbeiten, solange es nicht um die App geht –
  so kommt sich das nicht mit anderen Chats in die Quere.
- Firmware bauen: `pio run -e s3` bzw. `-e c3` (danach `.pio` löschen, nicht committen).

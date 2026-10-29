# Plan: Zahnputz-Kamera 🪥

**Stand:** Idee/Plan, noch nicht gebaut. Verbindung zur App (abhaken, Punkte) kommt später.

Ein kleines Gerät am Badezimmerspiegel erkennt, ob ein Kind wirklich Zähne putzt, und zeigt mit einem LED-Ring die
2 Minuten an (4 Viertel = 4 Kieferhälften).

## Erkennung – zwei Signale, beide nur auf dem Gerät

1. **Ton der elektrischen Zahnbürste:** Das Mikrofon hört den typischen Brummton (Schallzahnbürsten haben einen
   festen Ton um 250 Hz). Das erkennt der ESP32 selbst per Frequenzanalyse – sehr zuverlässig.
2. **Kamera mit KI auf dem Gerät:** Ein kleines Erkennungsmodell auf dem ESP32-S3 prüft, ob ein Gesicht vor dem
   Spiegel ist und sich im Mundbereich etwas bewegt.

Erst wenn **beides** zusammen passt, läuft die Zeit weiter. Hört der Ton auf oder ist niemand da, pausiert der Ring.

## Datenschutz (wichtig – Kamera im Bad)

- Bilder werden **nur im Arbeitsspeicher** ausgewertet und sofort verworfen: **nichts gespeichert, nichts verschickt**,
  keine Cloud-KI.
- Zum Server geht nur „geputzt: ja, 2:05 Minuten“.
- Kein Bild-Stream, keine Vorschau in der App. Die Kamera zeigt Richtung Waschbecken, nicht in den Raum.

## Hardware

| Teil | Status |
| --- | --- |
| Seeed XIAO ESP32-S3 Sense (Kamera, Mikrofon, 8 MB PSRAM) | 🛒 |
| WS2812B-Ring 16 LEDs + 1000 µF + 330 Ω | 🛒 |
| USB-Netzteil 5 V + Kabel | 🛒 |
| Gehäuse aus PETG (Bad = feucht), mit Blende nach oben gegen Spritzwasser | 3D-Druck |

## Ablauf

1. Kind stellt sich hin und schaltet die Zahnbürste ein → Ring wird blau, die erste LED leuchtet.
2. Ring füllt sich in 2 Minuten; nach jeder halben Minute kurz blinken = Seite wechseln.
3. Nach 2 Minuten: Regenbogen-Animation 🌈.
4. Später: Meldung an FamilyConnect → „Zähne putzen“ wird abgehakt, evtl. Punkte.

## Vorgehen beim Bauen

1. Ton-Erkennung zuerst (einfach, sofort nützlich).
2. Danach Kamera: Gesichtserkennung auf dem Gerät (fertige Modelle für den ESP32-S3), dann Bewegung im Mundbereich.
3. Zum Schluss App-Anbindung.

## Offene Fragen

- Welche Zahnbürsten (Marke/Modell)? Jede brummt etwas anders – dafür gibt es einen Lernmodus („Zahnbürste jetzt
  einschalten“).
- Für ein Kind oder für mehrere (Erkennung, wer putzt, nur über Zeiten/Bürste, nicht über Gesichter)?

# Projekte und Ideen – Stand 03.11.2026

Was gerade läuft, was gemerkt ist und was erst auf Zuruf umgesetzt wird. Neue Ideen kommen hier dazu,
erledigte wandern nach unten.

## In Arbeit

- **Musik-Box** ([hardware/musikbox](hardware/musikbox/)) – Gehäuse gedruckt, Drehknopf passt, Firmware 2.1 im
  Browser aufspielbar (Musik → Musik-Box → „Per USB einrichten“). Als Nächstes: Firmware 2.1 aufspielen und WLAN
  einrichten, neuen Boden drucken (ESP32-Halter für das Board 56,7 × 28,2 mm), verkabeln, zusammenbauen, erste Karte
  testen. Mit echter Hardware noch ungetestet: Kartenlesen, Lautstärke, Tasten.
- **„Wo bist du?“ Stufe 2 – automatische Antwort** (v1.74, braucht die neue Android-App): Fragt ein Admin, antworten
  alle Handys automatisch; fragen Eltern ein Kind, antwortet dessen Handy automatisch. Das Handy braucht den Standort
  „Immer erlauben“; die Person bekommt jedes Mal „… hat deinen Standort abgerufen“. Klappt es nicht, kommt nach 45 s
  die normale Frage. Muss auf echten Handys getestet werden (auch Stufe 1 mit Adresse und Karte).
- **Musik über Home Assistant** – laut Nutzer „sind wir dabei“; im Repo ist dazu noch nichts gebaut.

## Gebaut, wartet auf dich

- **Aufsteh-Ampel** ([hardware/aufsteh-ampel](hardware/aufsteh-ampel/), Plan: [docs/plaene/aufsteh-ampel.md](docs/plaene/aufsteh-ampel.md))
  – ESP32 + 8×8-Matrix (roter Mond, gelber Sonnenaufgang, ganze Sonne). Firmware und Verkabelung fertig; wird später
  gebaut. Danach: Zeiten in der App einstellen (App-Einbindung erst nach dem Bau).
- **Wandsensor** ([hardware/wandsensor](hardware/wandsensor/)) – Radar weckt das Wanddisplay, BH1750 schaltet den
  Dark Mode. Fertig, noch nicht getestet.
- **Zahnputzkamera** ([docs/plaene/zahnputz-kamera.md](docs/plaene/zahnputz-kamera.md)) – Kamera + KI-Auswertung,
  ob geputzt wird, dazu Geräuscherkennung der elektrischen Zahnbürste. Firmware, sobald die Teile da sind (erst
  Geräusch, dann Kamera); App-Einbindung („Punkt 2“) später. Keine Bilder speichern oder verschicken – Auswertung
  nur auf dem Gerät.

## Gemerkt – erst auf Zuruf umsetzen

- **„Bitte lüften“-Lampe** – kommt noch: WS2812B-Ring leuchtet blau, solange die Luftfeuchte des Tuya-Thermometers
  über dem Grenzwert liegt (Werte/Grenzen aus dem Raumklima der App), geht nach dem Lüften wieder aus.
- **Wochenplan-Assistent** für den Essensplan – als Nächstes vormerken.
- **Taschengeld-Konto** – Idee muss noch ausgearbeitet werden (Kontostand je Kind, wöchentliche Gutschrift,
  Ausgaben, evtl. Verbindung zu Punkten).
- **Familien-Dokumente** (Impfpass, Versicherungskarten, WLAN …) – nur mit echter Sicherheit: Dateien verschlüsselt
  auf dem Server, Zugriff nur für Eltern, PIN/zweite Bestätigung, kein Vorschaubild im Cache.
- **„Wo bist du?“: Karte direkt auf der Übersicht oder Familienkarte** (wer ist gerade wo) – erstmal nicht, merken.
- **Finanzen: Sparziel** – erstmal nicht, merken.

## Verworfen

- Familien-Station (rundes Display, RFID-Anhänger) – Idee nicht mehr gewollt
- Müllabfuhr automatisch aus dem ICS-Kalender – nicht benötigt (Dienste gibt es manuell)
- Barcode-Scanner für die Einkaufsliste – nicht benötigt
- iPhone-App – kein iPhone in der Familie

## Erledigt (Auswahl)

Feste Einkaufsliste mit Warengruppen · Dienste mit Rotation · Geburtstage mit Geschenkideen · Abstimmungen und
Familien-Umfrage (Essen → Essensplan, Ausflug → Kalender) · Ferien & Feiertage · Tuya-Raumklima (läuft) ·
Server-Update per Knopf · NFC-Aufkleber in der App beschreiben · Wunschliste · Wetter · Wanddisplay fürs Fire 7 mit
Fenerbahçe-Banner · Kalender: Logos (auch beide Wappen), Gegner-Assistent, Formel 1, Wischen, Termine absagen, Chat
bleibt beim Verschieben · Ausgeliehen · Orte mit „angekommen/losgegangen“ (Fehlmeldungen behoben) · Musik über
Spotify mit NFC-Karten · Spiele (Tic-Tac-Toe, Vier gewinnt, Memory, Wörter raten, Kniffel online, Schiffe versenken;
„Du bist dran“ kommt) · Punkte & Belohnungen · „Wo bist du?“ mit Adresse und Karte · Finanzen (Aufteilung aufs
gemeinsame Konto, einmalige Zahlungen) · eigene Kürzel im Profilbild · Testfunktionen aufgelöst (alles freigegeben)

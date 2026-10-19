# Geplant – noch nicht umgesetzt

Ideen und abgestimmte Vorhaben, die erst auf Zuruf umgesetzt werden.

## NFC-Aufkleber direkt in der App beschreiben (abgestimmt, wartet auf „los“)

Bisher schreibt man die Adresse einer Gewohnheit (`familyconnect://h/<token>`) mit der App
„NFC Tools“ auf den Aufkleber. Künftig soll FamilyConnect das selbst können.

**Ablauf**
1. Gewohnheit anlegen oder öffnen → Knopf **„Auf NFC-Tag schreiben“**
2. Hinweis „Halte jetzt den Aufkleber an die Rückseite deines Handys“
3. Aufkleber dranhalten → Adresse wird geschrieben, kurzes Vibrieren, „Fertig“
4. Danach wie bisher: Handy dranhalten = abgehakt

**Umsetzung**
- Eigenes kleines Capacitor-Plugin in `client/android` (kein Fremdpaket): `NfcAdapter.enableReaderMode`,
  NDEF-URI-Record schreiben (`Ndef.writeNdefMessage`, unformatierte Tags über `NdefFormatable`)
- Braucht eine **neue APK** (GitHub baut sie, Update-Hinweis in der App); Knopf nur zeigen, wenn
  `Capacitor.isPluginAvailable('NfcWriter')` – ältere APKs zeigen weiter den Hinweis auf „NFC Tools“
- Klare Fehlermeldungen: Tag zu klein, schreibgeschützt, kein NDEF, NFC ausgeschaltet
- Unterstützt gängige Aufkleber (NTAG213/215/216); bereits beschriebene Tags lassen sich überschreiben
- Nur für Eltern/Admins (wie Gewohnheiten bearbeiten)

**Offen:** Option „Aufkleber sperren“ (danach nicht mehr überschreibbar, nicht umkehrbar) – mit
oder ohne? Vor der Umsetzung nachfragen.

## Später (abgestimmt, noch nicht umsetzen)

- **Punkte & Belohnungen** – „klingt gut, aber noch nicht“: Punkte für Aufgaben/Gewohnheiten/Dienste,
  Belohnungen einlösen über Anfragen, Wochen-Rangliste
- **Taschengeld-Konto** – Idee muss noch ausgearbeitet werden (Kontostand je Kind, wöchentliche
  Gutschrift, Ausgaben, evtl. Verbindung zu Punkten)
- **Wochenplan-Assistent** für den Essensplan – noch nicht
- **Familien-Dokumente** (Impfpass, Versicherungskarten, WLAN …) – nur wenn es wirklich sicher ist:
  Verschlüsselung der Dateien auf dem Server, Zugriff nur für Eltern, PIN/zweite Bestätigung, kein
  Vorschaubild im Cache
- **Müllabfuhr automatisch** aus dem ICS-Kalender der Stadt – erstmal nicht (Dienste gibt es manuell)
- **Wanddisplay-Modus** für das Fire 7 HD – Generation klären (Fire OS 5 = nur Browser, ab Fire OS 7 auch App)
- **Barcode-Scanner** für die Einkaufsliste – erstmal nicht
- **Standort teilen** – erstmal nicht

## Erledigt aus der Ideenliste

- Feste Einkaufsliste mit Warengruppen, Dienste mit Rotation (Müllabfuhr), Geburtstage mit
  Geschenkideen, Abstimmungen auf der Pinnwand, Ferien & Feiertage nach Bundesland, Tuya-Raumklima

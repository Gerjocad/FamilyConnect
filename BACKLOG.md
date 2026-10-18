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

## Weitere Ideen

- Punktesystem und Belohnungen für Gewohnheiten
- Tuya-Thermometer (Temperatur/Luftfeuchte aufs Dashboard, Warnungen) – braucht Konto auf platform.tuya.com
- Standort der Familienmitglieder auf einer Karte (freiwillig, neue APK nötig)
- Müllabfuhr-Erinnerung, Wanddisplay-Modus, Barcode-Scanner für die Einkaufsliste

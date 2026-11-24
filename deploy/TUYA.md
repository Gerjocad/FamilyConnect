# Tuya-Thermometer einrichten

FamilyConnect liest die Werte über die Tuya-Cloud (dieselbe wie die Smart-Life-App).
Voraussetzung: ein Cloud-Projekt auf https://platform.tuya.com (Data Center **Central Europe**),
in dem das Smart-Life-Konto verknüpft ist und das Thermometer unter *Devices* erscheint.

## Zugangsdaten auf den Server

**Access ID und Access Secret nie in einen Chat oder eine Nachricht kopieren** – sie gehören nur auf den Server.

1. Auf platform.tuya.com im Projekt unter **Overview** Access ID und Access Secret anzeigen lassen.
2. In PowerShell mit dem Server verbinden (oder `Oracle-Server.bat` doppelklicken):
   ```powershell
   ssh -i "$HOME\Documents\KeY\ssh-key-2026-10-17.key" ubuntu@138.2.173.239
   ```
3. Datei anlegen:
   ```bash
   sudo nano /etc/familyconnect/tuya.json
   ```
   Folgendes eintragen und die beiden Werte ersetzen (Anführungszeichen bleiben stehen):
   ```json
   { "access_id": "HIER_ACCESS_ID", "access_secret": "HIER_ACCESS_SECRET", "region": "eu" }
   ```
   Speichern mit `Strg+O`, `Enter`, schließen mit `Strg+X`.
4. Nur für FamilyConnect lesbar machen und neu starten:
   ```bash
   sudo chown root:familyconnect /etc/familyconnect/tuya.json
   sudo chmod 640 /etc/familyconnect/tuya.json
   sudo systemctl restart familyconnect
   journalctl -u familyconnect -n 8 --no-pager
   ```
   Dort sollte „Tuya-Thermometer: aktiv“ stehen.

## In der App

Familie & Profil → **Thermometer** (nur Admins): Thermometer anhaken, Namen vergeben (z. B. „Kinderzimmer“)
und optional Grenzwerte eintragen. Die Werte erscheinen auf der Übersicht unter „Raumklima“; liegt ein Wert
außerhalb der Grenzen oder ist die Batterie fast leer, bekommen Eltern eine Push-Nachricht.

## Wenn es nicht mehr geht

Die kostenlose Testphase von **IoT Core** läuft ab (Tuya schickt vorher eine Mail „Service Expiration Notice“). Dann
zeigt die App „Die Tuya-Testphase ist abgelaufen“. So neu holen (kostenlos):

1. https://www.tuya.com/vas/user/service öffnen und anmelden.
2. Im Suchfeld `IoT Core` eingeben → **Search** → auf den blauen Link **IoT Core** klicken.
3. Auf der Produktseite **„Trial Edition (For testing purposes only)“** wählen – Preis **$ 0.00**, Gültigkeit 1 Monat.
4. **Buy Now** → in der Kasse prüfen, dass **0,00** dasteht → bestätigen. Es wird keine Kreditkarte gebraucht.
   Steht dort ein Betrag über 0 oder werden Zahlungsdaten verlangt: abbrechen.
5. Nach ein paar Minuten laufen Raumklima und Smart Home wieder – am Server muss nichts geändert werden.

Gibt es die Trial Edition nicht mehr: auf der Seite links **My Service Ticket** → Ticket „Please extend my IoT Core
trial, private smart home use only“.

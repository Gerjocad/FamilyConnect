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
zeigt die App „Die Tuya-Testphase ist abgelaufen“. Die „Trial Edition“ lässt sich **nicht neu abschließen**
(„You have subscribed to the trial edition before“) – sie wird stattdessen **verlängert** (kostenlos):

1. Auf https://platform.tuya.com anmelden.
2. Links **Cloud** → **Development** → das Projekt öffnen (in dem das Smart-Life-Konto verknüpft ist).
3. Auf der Projektseite bzw. unter **Cloud → Cloud Services → IoT Core** steht bei abgelaufener Testphase
   **„Extend Trial Period“** – anklicken und das Formular ausfüllen: Nutzung *Personal / individual developer*,
   Zweck z. B. *„Private smart home use, reading my own thermometers and switching my own plugs“*.
4. Die Freigabe kommt per E-Mail (meist innerhalb von 1–3 Werktagen). Danach läuft alles wieder – am Server muss
   nichts geändert werden.

Findet sich kein „Extend Trial Period“: unter https://www.tuya.com/vas/user/service links **My Service Ticket** →
neues Ticket: *„My IoT Core trial expired. I use it only privately for my own smart home (a few thermometers, lamps
and plugs). Please extend the trial period.“* Nichts kaufen – „Flagship“/„Corporate“ kosten Geld.

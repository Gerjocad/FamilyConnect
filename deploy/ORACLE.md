# FamilyConnect kostenlos bei Oracle Cloud betreiben

Oracle Cloud „Always Free“ stellt dauerhaft einen kleinen eigenen Server zur Verfügung. FamilyConnect läuft dort rund um die Uhr, ohne dass dein PC an sein muss.

## 1. Konto anlegen

1. Auf <https://www.oracle.com/cloud/free/> „Kostenlos starten“ wählen.
2. **Home-Region: „Germany Central (Frankfurt)“** wählen. Die Region lässt sich später nicht mehr ändern.
3. Kreditkarte zur Identitätsprüfung angeben. Solange du nur „Always Free“-Ressourcen nutzt, wird nichts abgebucht.

## 2. Server erstellen

1. In der Konsole: **☰ → Compute → Instances → Create instance**.
2. **Name:** `familyconnect`
3. **Image:** „Change image“ → **Canonical Ubuntu 24.04**.
4. **Shape:** „Change shape“ → **VM.Standard.E2.1.Micro** (AMD, mit „Always Free-eligible“ gekennzeichnet).
   Alternativ geht auch **VM.Standard.A1.Flex** (Ampere) mit 1 OCPU und 6 GB, falls verfügbar.
5. **Networking:** „Create new virtual cloud network“ und „Assign a public IPv4 address“ aktiviert lassen.
6. **SSH keys:** **„Save private key“** klicken und die Datei gut aufbewahren (z. B. `C:\Users\DeinName\.ssh\oracle.key`).
7. **Create** klicken. Nach 1–2 Minuten steht der Server auf „Running“. Notiere dir die **Public IP address**.

## 3. Ports 80 und 443 freigeben

1. Auf der Instanzseite unter **Primary VNIC** auf das **Subnet** klicken.
2. **Security Lists** (bzw. „Security“) → **Default Security List** öffnen.
3. **Add Ingress Rules** und zwei Regeln anlegen:

   | Source CIDR | IP Protocol | Destination Port Range |
   | --- | --- | --- |
   | `0.0.0.0/0` | TCP | `80` |
   | `0.0.0.0/0` | TCP | `443` |

## 4. Auf den Server verbinden

In PowerShell (die IP durch deine ersetzen):

```powershell
ssh -i $HOME\.ssh\oracle.key ubuntu@123.45.67.89
```

Meldet SSH „UNPROTECTED PRIVATE KEY FILE“, einmal die Dateirechte korrigieren und es erneut versuchen:

```powershell
icacls $HOME\.ssh\oracle.key /inheritance:r /grant:r "$($env:USERNAME):R"
```

Die Frage „Are you sure you want to continue connecting?“ mit `yes` beantworten.

## 5. FamilyConnect installieren

Auf dem Server (also im SSH-Fenster) diesen einen Befehl ausführen:

```bash
curl -fsSL https://raw.githubusercontent.com/Gerjocad/FamilyConnect/ccr-8a2b35be-ngz4x8/deploy/install.sh | sudo bash
```

Das dauert etwa 5 Minuten. Am Ende steht die Adresse da, z. B. `https://123-45-67-89.sslip.io`.

## 6. Benutzen

- **Browser:** die Adresse öffnen. Beim ersten Aufruf kann es 1–2 Minuten dauern, bis das HTTPS-Zertifikat da ist.
- **Android-App:** abmelden (Familie & Profil → Abmelden) und die neue Adresse als Server-Adresse eintragen.
- Die Konten vom PC-Server werden nicht mit umgezogen. Am einfachsten registriert ihr euch auf dem neuen Server neu.

## Wartung

| Was | Wie |
| --- | --- |
| Aktualisieren | den Installationsbefehl aus Schritt 5 erneut ausführen |
| Protokoll ansehen | `journalctl -u familyconnect -f` |
| Neu starten | `sudo systemctl restart familyconnect` |
| Backups | täglich automatisch in `/var/backups/familyconnect` (14 Tage) |
| Backup auf den PC holen | `scp -i $HOME\.ssh\oracle.key ubuntu@IP:/var/backups/familyconnect/*.db .` |

## Gut zu wissen

- **Ungenutzte Server:** Oracle kann Always-Free-Server zurückfordern, die über 7 Tage kaum ausgelastet sind. Eine Familien-App ist meist sehr sparsam. Wer auf Nummer sicher gehen will, stellt das Konto auf „Pay As You Go“ um: Die Always-Free-Ressourcen bleiben kostenlos, aber diese Regel entfällt. Hol dir außerdem ab und zu ein Backup auf den PC.
- **Eigene Domain:** Statt `sslip.io` geht auch eine kostenlose Adresse von <https://www.duckdns.org>. Die DuckDNS-Adresse auf die IP des Servers zeigen lassen und dann so installieren:
  `curl -fsSL …/install.sh | sudo DOMAIN=meinefamilie.duckdns.org bash`

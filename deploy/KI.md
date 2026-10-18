# Rezept-Import per KI (optional)

Ohne KI übernimmt FamilyConnect Rezepte von allen Seiten, die ihre Rezepte maschinenlesbar
beschreiben (schema.org) – das sind fast alle großen Rezeptseiten wie Chefkoch, Lecker,
Kitchen Stories, EatSmarter oder Essen & Trinken. Das kostet nichts.

Mit einem Schlüssel für die Claude-API (Anthropic) kann FamilyConnect zusätzlich

- Blogs und Seiten **ohne** Rezept-Daten auslesen und
- **eingefügten Text** (z. B. aus WhatsApp oder einer Video-Beschreibung) in ein Rezept verwandeln.

## Kosten

Abgerechnet wird pro Nutzung. Ein Rezept kostet mit dem voreingestellten, günstigen Modell
(Claude Haiku) etwa 1–2 Cent. Unter console.anthropic.com → *Billing* lässt sich ein festes
Monatslimit einstellen, z. B. 5 €.

## Einrichten

1. Auf https://console.anthropic.com ein Konto anlegen, unter *Billing* etwas Guthaben aufladen.
2. Unter *API Keys* → *Create Key* einen Schlüssel erstellen (beginnt mit `sk-ant-`).
   **Den Schlüssel nirgends posten oder weitergeben** – er gehört nur auf den Server.
3. Per SSH auf den Server und den Schlüssel in eine Datei schreiben:
   ```bash
   ssh -i $HOME\Documents\KeY\ssh-key-2026-10-17.key ubuntu@138.2.173.239
   sudo mkdir -p /etc/familyconnect
   sudo nano /etc/familyconnect/anthropic.key
   ```
   Schlüssel einfügen (Rechtsklick), dann `Strg+O`, `Enter`, `Strg+X`.
4. Nur für FamilyConnect lesbar machen und prüfen:
   ```bash
   sudo chown root:familyconnect /etc/familyconnect/anthropic.key
   sudo chmod 640 /etc/familyconnect/anthropic.key
   sudo systemctl restart familyconnect
   journalctl -u familyconnect -n 5
   ```
   Dort sollte „Rezept-Import per KI: aktiv“ stehen. In der App erscheint beim neuen Rezept
   der Reiter „Text einfügen“.

Abschalten: Datei löschen (`sudo rm /etc/familyconnect/anthropic.key`).

Das Modell lässt sich über die Variable `ANTHROPIC_MODEL` ändern, der Pfad der Datei über
`ANTHROPIC_API_KEY_FILE`; alternativ kann der Schlüssel direkt als `ANTHROPIC_API_KEY` gesetzt werden.

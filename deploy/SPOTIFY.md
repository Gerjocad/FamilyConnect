# Musik über Spotify einrichten

FamilyConnect startet Spotify-Playlists auf euren Lautsprechern (z. B. Google Home) – per Musik-Karte in der App
oder per NFC-Aufkleber. Dafür braucht es **Spotify Premium** und einmalig einen eigenen Zugang bei Spotify.

## 1. Zugang bei Spotify anlegen (ca. 5 Minuten)

1. <https://developer.spotify.com/dashboard> öffnen und mit deinem Spotify-Konto anmelden
   (beim ersten Mal die Bedingungen bestätigen).
2. **Create app**:
   - **App name:** z. B. `Familie Musik`
   - **App description:** z. B. `Playlists zu Hause starten`
   - **Redirect URI:** genau die Adresse, die FamilyConnect unter **Musik** anzeigt, z. B.
     `https://123-45-67-89.sslip.io/api/spotify/callback` → **Add**
   - Bei „Which API/SDKs are you planning to use?“ **Web API** anhaken
3. **Save**. Danach unter **Settings** die **Client ID** und – über „View client secret“ – das **Client secret** anzeigen.
4. Unter **User Management** die Spotify-Konten (E-Mail) eintragen, die verbunden werden sollen – mindestens dein eigenes.

## 2. Zugang auf dem Server ablegen

Die beiden Werte **nicht** in Chats oder E-Mails kopieren, sondern direkt auf dem Server einfügen:

```bash
sudo nano /etc/familyconnect/spotify.json
```

```json
{ "client_id": "HIER_CLIENT_ID", "client_secret": "HIER_CLIENT_SECRET" }
```

```bash
sudo chown root:familyconnect /etc/familyconnect/spotify.json
sudo chmod 640 /etc/familyconnect/spotify.json
sudo systemctl restart familyconnect
```

## 3. In der App verbinden

**Musik** öffnen → **Mit Spotify verbinden** (nur Admins) → bei Spotify anmelden und zustimmen → zurück in die App.

## Gut zu wissen

- **Lautsprecher:** Spotify kann nur Geräte ansteuern, die es gerade kennt. Google-Home-Lautsprecher „schlafen“ nach
  längerer Pause für Spotify ein. Kommt „nicht erreichbar“, einmal in der Spotify-App auf dem Lautsprecher abspielen –
  danach klappt es wieder per Karte. Ist das zu oft nötig, hilft später ein kleiner Helfer zu Hause (z. B. Home Assistant).
- **Ohne Premium** lässt Spotify keine Fernsteuerung zu.
- Die Verbindung lässt sich unter **Musik → Spotify-Verbindung trennen** jederzeit lösen; zusätzlich unter
  <https://www.spotify.com/account/apps/> den Zugriff entziehen.

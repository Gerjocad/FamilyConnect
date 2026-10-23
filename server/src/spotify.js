// Musik: Spotify-Playlists auf Karten/NFC-Aufklebern, Wiedergabe über Spotify Connect (z. B. Google Home).
// Zugang: eigene „App“ auf developer.spotify.com → Client-ID/-Secret nur auf dem Server
// (/etc/familyconnect/spotify.json, siehe deploy/SPOTIFY.md). Pro Familie verbindet ein Admin einmal sein
// Spotify-Konto (Premium nötig); gespeichert wird nur das Refresh-Token.
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { Router } from 'express';
import { isManager } from './permissions.js';

const ACCOUNTS = 'https://accounts.spotify.com';
const API = 'https://api.spotify.com/v1';
const SCOPES = 'user-read-playback-state user-modify-playback-state user-read-currently-playing playlist-read-private user-read-private';
const STATE_TTL_MS = 10 * 60 * 1000;
const URI_RE = /^spotify:(playlist|album|artist|show):[A-Za-z0-9]{10,40}$/;

export class SpotifyError extends Error {
  constructor(message, status = 502) {
    super(message);
    this.status = status;
  }
}

/** Spotify-Link oder -URI → spotify:playlist:… (sonst null) */
export function parseSpotifyUri(input) {
  const text = String(input ?? '').trim();
  if (URI_RE.test(text)) return text;
  const m = /open\.spotify\.com\/(?:intl-[a-z]{2}\/)?(playlist|album|artist|show)\/([A-Za-z0-9]{10,40})/.exec(text);
  return m ? `spotify:${m[1]}:${m[2]}` : null;
}

export class SpotifyClient {
  #configFile;
  #config;
  #fetch;

  constructor({ configFile, config, fetchImpl = fetch } = {}) {
    this.#configFile = configFile;
    this.#config = config ?? null;
    this.#fetch = fetchImpl;
  }

  config() {
    if (this.#config) return this.#config;
    if (!this.#configFile || !existsSync(this.#configFile)) return null;
    try {
      const data = JSON.parse(readFileSync(this.#configFile, 'utf8'));
      return data.client_id && data.client_secret ? data : null;
    } catch {
      return null;
    }
  }

  get enabled() {
    return Boolean(this.config());
  }

  authorizeUrl(redirectUri, state) {
    const params = new URLSearchParams({ response_type: 'code', client_id: this.config().client_id, scope: SCOPES, redirect_uri: redirectUri, state, show_dialog: 'true' });
    return `${ACCOUNTS}/authorize?${params}`;
  }

  async #token(body) {
    const { client_id: id, client_secret: secret } = this.config();
    const res = await this.#fetch(`${ACCOUNTS}/api/token`, {
      method: 'POST',
      headers: { Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(body).toString(),
      signal: AbortSignal.timeout(10_000),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new SpotifyError(data.error === 'invalid_grant' ? 'Die Spotify-Verbindung ist abgelaufen – bitte neu verbinden' : `Spotify-Anmeldung fehlgeschlagen (${data.error ?? res.status})`, res.status === 400 ? 401 : 502);
    return data;
  }

  exchangeCode(code, redirectUri) {
    return this.#token({ grant_type: 'authorization_code', code, redirect_uri: redirectUri });
  }

  refresh(refreshToken) {
    return this.#token({ grant_type: 'refresh_token', refresh_token: refreshToken });
  }

  /** Aufruf der Web-API; liefert JSON oder null (204) */
  async call(accessToken, method, path, body) {
    let res;
    try {
      res = await this.#fetch(`${API}${path}`, {
        method,
        headers: { Authorization: `Bearer ${accessToken}`, ...(body !== undefined && { 'Content-Type': 'application/json' }) },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      throw new SpotifyError('Spotify ist gerade nicht erreichbar');
    }
    if (res.status === 204 || res.status === 202) return null;
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const reason = data?.error?.reason;
      const message = data?.error?.message ?? `Fehler ${res.status}`;
      const err = new SpotifyError(
        reason === 'NO_ACTIVE_DEVICE' ? 'Kein Lautsprecher bereit – einmal in der Spotify-App auf dem Lautsprecher abspielen, danach klappt es per Karte'
          : reason === 'PREMIUM_REQUIRED' ? 'Dafür braucht es Spotify Premium'
            : res.status === 404 ? 'Lautsprecher oder Playlist nicht gefunden'
              : `Spotify: ${message}`,
        res.status === 401 ? 401 : 502,
      );
      err.reason = reason;
      err.httpStatus = res.status;
      throw err;
    }
    return data;
  }
}

export function spotifyRouter(db, { auth, member, publish, spotify, publicUrl }) {
  const router = Router();
  const base = '/api/families/:familyId';
  const states = new Map();
  const admin = (req, res, next) => (req.role === 'admin' ? next() : res.status(403).json({ error: 'Nur Admins verbinden Spotify' }));
  const managers = (req, res, next) => (isManager(req.role) ? next() : res.status(403).json({ error: 'Musik-Karten legen die Eltern an' }));

  // Spotify verlangt die Rücksprungadresse exakt so, wie sie im Spotify-Dashboard eingetragen ist
  const redirectUri = (req) => {
    if (publicUrl) return `${publicUrl.replace(/\/$/, '')}/api/spotify/callback`;
    const proto = String(req.get('x-forwarded-proto') ?? req.protocol).split(',')[0];
    return `${proto}://${req.get('host')}/api/spotify/callback`;
  };
  const account = (familyId) => db.prepare('SELECT * FROM spotify_accounts WHERE family_id = ?').get(familyId);

  /** gültiges Zugangs-Token der Familie (erneuert es bei Bedarf) */
  async function accessToken(familyId) {
    const acc = account(familyId);
    if (!acc) throw new SpotifyError('Spotify ist noch nicht verbunden', 409);
    if (acc.access_token && acc.expires_at > Date.now() + 30_000) return acc.access_token;
    const data = await spotify.refresh(acc.refresh_token);
    db.prepare('UPDATE spotify_accounts SET access_token = ?, expires_at = ?, refresh_token = COALESCE(?, refresh_token) WHERE family_id = ?')
      .run(data.access_token, Date.now() + data.expires_in * 1000, data.refresh_token ?? null, familyId);
    return data.access_token;
  }
  const api = async (familyId, method, path, body) => spotify.call(await accessToken(familyId), method, path, body);

  const fail = (res, err) => {
    if (!(err instanceof SpotifyError)) throw err;
    res.status(err.status === 401 ? 409 : err.status).json({ error: err.message });
  };

  /** Playlist abspielen: gewählter Lautsprecher, sonst der gerade aktive, sonst der erste verfügbare */
  async function play(familyId, card) {
    const acc = account(familyId);
    const { devices = [] } = (await api(familyId, 'GET', '/me/player/devices')) ?? {};
    let device = acc.device_id ? devices.find((d) => d.id === acc.device_id) ?? devices.find((d) => d.name === acc.device_name) : null;
    if (acc.device_id && !device) {
      throw new SpotifyError(`„${acc.device_name}“ ist für Spotify gerade nicht erreichbar – einmal in der Spotify-App darauf abspielen, danach klappt es per Karte`, 409);
    }
    device ??= devices.find((d) => d.is_active) ?? devices.find((d) => !d.is_restricted) ?? null;
    if (!device) throw new SpotifyError('Kein Lautsprecher gefunden – Spotify einmal auf dem Google Home oder Handy öffnen', 409);
    await api(familyId, 'PUT', `/me/player/play?device_id=${encodeURIComponent(device.id)}`, { context_uri: card.uri });
    if (card.shuffle) await api(familyId, 'PUT', `/me/player/shuffle?state=true&device_id=${encodeURIComponent(device.id)}`).catch(() => {});
    db.prepare("UPDATE music_cards SET played_at = datetime('now') WHERE id = ?").run(card.id);
    publish(familyId, 'music');
    return { device: device.name, card: { id: card.id, name: card.name, image: card.image } };
  }

  // --- Verbindung --------------------------------------------------------------------
  router.get(`${base}/spotify`, auth, member, (req, res) => {
    const acc = account(req.familyId);
    res.json({
      configured: spotify.enabled,
      connected: Boolean(acc),
      account: acc ? { name: acc.display_name, premium: acc.product === 'premium' } : null,
      device: acc?.device_id ? { id: acc.device_id, name: acc.device_name } : null,
      redirect_uri: redirectUri(req),
    });
  });

  router.post(`${base}/spotify/connect`, auth, member, admin, (req, res) => {
    if (!spotify.enabled) return res.status(409).json({ error: 'Spotify ist auf dem Server noch nicht eingerichtet (deploy/SPOTIFY.md)' });
    const state = randomBytes(16).toString('hex');
    for (const [k, v] of states) if (v.expires < Date.now()) states.delete(k);
    states.set(state, { familyId: req.familyId, userId: req.user.id, redirect: redirectUri(req), expires: Date.now() + STATE_TTL_MS });
    res.json({ url: spotify.authorizeUrl(redirectUri(req), state) });
  });

  // Rücksprung von Spotify (öffnet sich im Browser) – einfache Seite, danach zurück in die App
  router.get('/api/spotify/callback', async (req, res) => {
    const page = (ok, text) => res.status(ok ? 200 : 400).type('html').send(`<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Spotify</title><style>body{font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:90vh;margin:0;background:#fff8f3;color:#2b2118}main{text-align:center;padding:24px;max-width:380px}b{font-size:3rem;display:block}a{color:#e8590c;font-weight:700}</style></head>
<body><main><b>${ok ? '🎵' : '⚠️'}</b><h1>${ok ? 'Spotify ist verbunden' : 'Hat nicht geklappt'}</h1><p>${text}</p><p><a href="/musik">Zurück zur Musik</a></p></main></body></html>`);
    const entry = states.get(String(req.query.state ?? ''));
    states.delete(String(req.query.state ?? ''));
    if (!entry || entry.expires < Date.now()) return page(false, 'Der Link ist abgelaufen – bitte in der App erneut auf „Mit Spotify verbinden“ tippen.');
    if (req.query.error || !req.query.code) return page(false, 'Die Anmeldung bei Spotify wurde abgebrochen.');
    try {
      const token = await spotify.exchangeCode(String(req.query.code), entry.redirect);
      const me = await spotify.call(token.access_token, 'GET', '/me');
      db.prepare(
        `INSERT INTO spotify_accounts (family_id, refresh_token, access_token, expires_at, display_name, product, connected_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (family_id) DO UPDATE SET refresh_token = excluded.refresh_token, access_token = excluded.access_token,
           expires_at = excluded.expires_at, display_name = excluded.display_name, product = excluded.product, connected_by = excluded.connected_by`
      ).run(entry.familyId, token.refresh_token, token.access_token, Date.now() + token.expires_in * 1000, me?.display_name ?? me?.id ?? '', me?.product ?? '', entry.userId);
      publish(entry.familyId, 'music');
      page(true, me?.product === 'premium'
        ? 'Du kannst dieses Fenster schließen und zur FamilyConnect-App zurückkehren.'
        : 'Achtung: Das Konto hat kein Spotify Premium – ohne Premium lässt Spotify keine Fernsteuerung zu.');
    } catch (err) {
      page(false, err instanceof SpotifyError ? err.message : 'Unbekannter Fehler');
    }
  });

  router.delete(`${base}/spotify`, auth, member, admin, (req, res) => {
    db.prepare('DELETE FROM spotify_accounts WHERE family_id = ?').run(req.familyId);
    publish(req.familyId, 'music');
    res.status(204).end();
  });

  // Lautsprecher, die Spotify gerade kennt
  router.get(`${base}/spotify/devices`, auth, member, async (req, res) => {
    try {
      const { devices = [] } = (await api(req.familyId, 'GET', '/me/player/devices')) ?? {};
      res.json(devices.map((d) => ({ id: d.id, name: d.name, type: d.type, active: d.is_active, volume: d.volume_percent })));
    } catch (err) {
      fail(res, err);
    }
  });

  // Fester Lautsprecher (oder null = automatisch: der gerade aktive)
  router.put(`${base}/spotify/device`, auth, member, managers, (req, res) => {
    if (!account(req.familyId)) return res.status(409).json({ error: 'Spotify ist noch nicht verbunden' });
    const id = req.body?.id ?? null;
    const name = typeof req.body?.name === 'string' ? req.body.name.slice(0, 100) : null;
    if (id !== null && (typeof id !== 'string' || !name)) return res.status(400).json({ error: 'Ungültiger Lautsprecher' });
    db.prepare('UPDATE spotify_accounts SET device_id = ?, device_name = ? WHERE family_id = ?').run(id, id ? name : null, req.familyId);
    publish(req.familyId, 'music');
    res.status(204).end();
  });

  // Was läuft gerade?
  router.get(`${base}/spotify/player`, auth, member, async (req, res) => {
    try {
      const p = await api(req.familyId, 'GET', '/me/player');
      res.json(p ? {
        playing: p.is_playing,
        device: p.device?.name ?? null,
        volume: p.device?.volume_percent ?? null,
        track: p.item ? { name: p.item.name, artists: (p.item.artists ?? []).map((a) => a.name).join(', '), image: p.item.album?.images?.at(-1)?.url ?? null } : null,
        context: p.context?.uri ?? null,
      } : null);
    } catch (err) {
      fail(res, err);
    }
  });

  // Steuerung: pause | resume | next | previous | volume (value 0–100)
  router.post(`${base}/spotify/player`, auth, member, async (req, res) => {
    const action = req.body?.action;
    const paths = { pause: ['PUT', '/me/player/pause'], resume: ['PUT', '/me/player/play'], next: ['POST', '/me/player/next'], previous: ['POST', '/me/player/previous'] };
    try {
      if (action === 'volume') {
        const v = Math.round(Number(req.body?.value));
        if (!(v >= 0 && v <= 100)) return res.status(400).json({ error: 'Lautstärke 0–100' });
        await api(req.familyId, 'PUT', `/me/player/volume?volume_percent=${v}`);
      } else if (paths[action]) {
        await api(req.familyId, ...paths[action]);
      } else {
        return res.status(400).json({ error: 'Unbekannte Aktion' });
      }
      res.status(204).end();
    } catch (err) {
      fail(res, err);
    }
  });

  // Playlists suchen (eigene zuerst) – oder einen eingefügten Spotify-Link erkennen
  router.get(`${base}/spotify/search`, auth, member, managers, async (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 200) : '';
    try {
      const pasted = parseSpotifyUri(q);
      if (pasted) {
        const [type, id] = pasted.split(':').slice(1);
        const item = await api(req.familyId, 'GET', `/${type}s/${id}?fields=name,images,uri,owner(display_name)`).catch(() => null);
        return res.json([{ uri: pasted, name: item?.name ?? 'Spotify-Link', image: item?.images?.[0]?.url ?? null, owner: item?.owner?.display_name ?? '' }]);
      }
      const mapPl = (p) => ({ uri: p.uri, name: p.name, image: p.images?.[0]?.url ?? null, owner: p.owner?.display_name ?? '' });
      const own = ((await api(req.familyId, 'GET', '/me/playlists?limit=50'))?.items ?? []).filter(Boolean).map(mapPl);
      if (!q) return res.json(own.slice(0, 30));
      const needle = q.toLocaleLowerCase('de');
      const mine = own.filter((p) => p.name.toLocaleLowerCase('de').includes(needle));
      const found = ((await api(req.familyId, 'GET', `/search?type=playlist&limit=10&q=${encodeURIComponent(q)}`))?.playlists?.items ?? []).filter(Boolean).map(mapPl);
      res.json([...mine, ...found.filter((f) => !mine.some((m) => m.uri === f.uri))].slice(0, 20));
    } catch (err) {
      fail(res, err);
    }
  });

  // --- Musik-Karten -----------------------------------------------------------------------
  const serialize = (c) => ({ id: c.id, name: c.name, uri: c.uri, image: c.image, emoji: c.emoji, shuffle: Boolean(c.shuffle), token: c.token, played_at: c.played_at });
  const findCard = (req) => db.prepare('SELECT * FROM music_cards WHERE family_id = ? AND id = ?').get(req.familyId, Number(req.params.id));
  const cardFields = (body, current = {}) => {
    const v = { ...current, ...body };
    const name = typeof v.name === 'string' ? v.name.trim().slice(0, 80) : '';
    const uri = parseSpotifyUri(v.uri);
    if (!name) return 'Bitte gib der Karte einen Namen';
    if (!uri) return 'Bitte eine Playlist auswählen oder einen Spotify-Link einfügen';
    const image = typeof v.image === 'string' && /^https:\/\/[^\s]+$/.test(v.image) ? v.image.slice(0, 500) : null;
    const emoji = typeof v.emoji === 'string' && v.emoji.trim() ? [...v.emoji.trim()].slice(0, 2).join('') : '🎵';
    return { name, uri, image, emoji, shuffle: v.shuffle ? 1 : 0 };
  };

  router.get(`${base}/music`, auth, member, (req, res) => {
    res.json(db.prepare('SELECT * FROM music_cards WHERE family_id = ? ORDER BY name COLLATE NOCASE').all(req.familyId).map(serialize));
  });

  router.post(`${base}/music`, auth, member, managers, (req, res) => {
    const f = cardFields(req.body);
    if (typeof f === 'string') return res.status(400).json({ error: f });
    const { lastInsertRowid } = db.prepare(
      "INSERT INTO music_cards (family_id, name, uri, image, emoji, shuffle, token, created_by) VALUES (?, ?, ?, ?, ?, ?, lower(hex(randomblob(16))), ?)"
    ).run(req.familyId, f.name, f.uri, f.image, f.emoji, f.shuffle, req.user.id);
    publish(req.familyId, 'music');
    res.status(201).json(serialize(db.prepare('SELECT * FROM music_cards WHERE id = ?').get(lastInsertRowid)));
  });

  router.patch(`${base}/music/:id`, auth, member, managers, (req, res) => {
    const card = findCard(req);
    if (!card) return res.status(404).json({ error: 'Karte nicht gefunden' });
    const f = cardFields(req.body, card);
    if (typeof f === 'string') return res.status(400).json({ error: f });
    db.prepare('UPDATE music_cards SET name = ?, uri = ?, image = ?, emoji = ?, shuffle = ? WHERE id = ?').run(f.name, f.uri, f.image, f.emoji, f.shuffle, card.id);
    publish(req.familyId, 'music');
    res.json(serialize(findCard(req)));
  });

  router.delete(`${base}/music/:id`, auth, member, managers, (req, res) => {
    const { changes } = db.prepare('DELETE FROM music_cards WHERE family_id = ? AND id = ?').run(req.familyId, Number(req.params.id));
    if (!changes) return res.status(404).json({ error: 'Karte nicht gefunden' });
    publish(req.familyId, 'music');
    res.status(204).end();
  });

  // Abspielen – aus der App
  router.post(`${base}/music/:id/play`, auth, member, async (req, res) => {
    const card = findCard(req);
    if (!card) return res.status(404).json({ error: 'Karte nicht gefunden' });
    try {
      res.json(await play(req.familyId, card));
    } catch (err) {
      fail(res, err);
    }
  });

  // … oder per NFC-Aufkleber (familyconnect://h/m/<token>) bzw. später von der Musik-Station
  router.post('/api/music/by-token/:token/play', auth, async (req, res) => {
    const card = db.prepare('SELECT * FROM music_cards WHERE token = ?').get(String(req.params.token).toLowerCase());
    const isMember = card && db.prepare('SELECT 1 FROM memberships WHERE family_id = ? AND user_id = ?').get(card.family_id, req.user.id);
    if (!card || !isMember) return res.status(404).json({ error: 'Diese Karte gehört zu keiner Musik deiner Familie' });
    try {
      res.json({ ...(await play(card.family_id, card)), family_id: card.family_id });
    } catch (err) {
      fail(res, err);
    }
  });

  return router;
}

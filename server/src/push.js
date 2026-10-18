// Push-Benachrichtigungen über Firebase Cloud Messaging (HTTP v1).
// Aktiv nur, wenn FIREBASE_SERVICE_ACCOUNT auf die JSON-Datei eines Firebase-Dienstkontos zeigt.
import { createSign } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';

const SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';

const base64url = (input) => Buffer.from(input).toString('base64url');

export function loadServiceAccount(file) {
  if (!file || !existsSync(file)) return null;
  try {
    const account = JSON.parse(readFileSync(file, 'utf8'));
    if (!account.client_email || !account.private_key || !account.project_id) throw new Error('unvollständig');
    return account;
  } catch (err) {
    console.error(`Push deaktiviert: ${file} ist kein gültiges Firebase-Dienstkonto (${err.message})`);
    return null;
  }
}

export class PushService {
  #account;
  #db;
  #fetch;
  #token = null;
  #tokenExpires = 0;
  #pending = new Map();

  /** @param options.batchDelayMs  Wartezeit, um mehrere Listeneinträge zu einer Nachricht zu bündeln */
  constructor(db, account, { fetchImpl = fetch, batchDelayMs = 20_000 } = {}) {
    this.#db = db;
    this.#account = account;
    this.#fetch = fetchImpl;
    this.batchDelayMs = batchDelayMs;
  }

  get enabled() {
    return Boolean(this.#account);
  }

  async #accessToken() {
    if (this.#token && Date.now() < this.#tokenExpires - 60_000) return this.#token;
    const now = Math.floor(Date.now() / 1000);
    const tokenUri = this.#account.token_uri ?? 'https://oauth2.googleapis.com/token';
    const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const claims = base64url(JSON.stringify({
      iss: this.#account.client_email, scope: SCOPE, aud: tokenUri, iat: now, exp: now + 3600,
    }));
    const signature = createSign('RSA-SHA256').update(`${header}.${claims}`).sign(this.#account.private_key, 'base64url');
    const res = await this.#fetch(tokenUri, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: `${header}.${claims}.${signature}`,
      }),
    });
    if (!res.ok) throw new Error(`Token-Anfrage fehlgeschlagen: ${res.status} ${await res.text()}`);
    const data = await res.json();
    this.#token = data.access_token;
    this.#tokenExpires = Date.now() + data.expires_in * 1000;
    return this.#token;
  }

  /** Schickt eine Nachricht an Geräte der angegebenen Nutzer */
  async sendToUsers(userIds, { title, body, path }) {
    if (!this.enabled || userIds.length === 0) return;
    const tokens = this.#db
      .prepare(`SELECT token FROM devices WHERE user_id IN (${userIds.map(() => '?').join(',')})`)
      .all(...userIds)
      .map((r) => r.token);
    if (tokens.length === 0) return;

    const accessToken = await this.#accessToken();
    const endpoint = this.#account.fcm_endpoint
      ?? `https://fcm.googleapis.com/v1/projects/${this.#account.project_id}/messages:send`;
    await Promise.all(tokens.map(async (token) => {
      const res = await this.#fetch(endpoint, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: {
            token,
            notification: { title, body },
            data: { path: path ?? '/' },
            android: { priority: 'high', notification: { channel_id: 'familyconnect', color: '#e8590c' } },
          },
        }),
      });
      // Abgemeldete oder ungültige Geräte entfernen
      if (res.status === 404 || res.status === 400) {
        const text = await res.text();
        if (/UNREGISTERED|INVALID_ARGUMENT|not a valid FCM registration token/i.test(text)) {
          this.#db.prepare('DELETE FROM devices WHERE token = ?').run(token);
        }
      } else if (!res.ok) {
        console.error(`Push an Gerät fehlgeschlagen: ${res.status} ${await res.text()}`);
      }
    }));
  }

  /** Alle Familienmitglieder außer dem Auslöser */
  #others(familyId, actorId) {
    return this.#db
      .prepare('SELECT user_id FROM memberships WHERE family_id = ? AND user_id != ?')
      .all(familyId, actorId)
      .map((r) => r.user_id);
  }

  #send(userIds, message) {
    this.sendToUsers(userIds, message).catch((err) => console.error('Push fehlgeschlagen:', err.message));
  }

  /** Freie Nachricht an einzelne Personen, z. B. für Anfragen */
  notify(userIds, message) {
    if (!this.enabled) return;
    this.#send(userIds.filter(Boolean), message);
  }

  notifyComplaint({ recipientId, from, text }) {
    if (!this.enabled) return;
    this.#send([recipientId], { title: `Beschwerde von ${from.split(' ')[0]}`, body: text, path: '/beschwerden' });
  }

  notifyComplaintResolved({ creatorId, by, reply }) {
    if (!this.enabled || !creatorId) return;
    this.#send([creatorId], { title: `${by.split(' ')[0]} hat deine Beschwerde erledigt`, body: reply || 'Erledigt ✔', path: '/beschwerden' });
  }

  /** Wird von den CRUD-Routen nach jeder Änderung aufgerufen */
  handleChange({ action, path, row, before, user, familyId }) {
    if (!this.enabled) return;
    const actor = user.name.split(' ')[0];

    if (path === 'posts' && action === 'create') {
      this.#send(this.#others(familyId, user.id), {
        title: `${actor} auf der Pinnwand`, body: truncate(row.text, 140), path: '/pinnwand',
      });
    } else if (path === 'events' && action === 'create') {
      // Bei Personen-Auswahl nur die Beteiligten, sonst alle
      const targets = row.member_ids.length > 0
        ? row.member_ids.filter((id) => id !== user.id)
        : this.#others(familyId, user.id);
      this.#send(targets, {
        title: 'Neuer Termin', body: `${row.title} · ${formatEventDate(row)} (von ${actor})`, path: '/kalender',
      });
    } else if (path === 'tasks' && row.assignee_id && row.assignee_id !== user.id
      && (action === 'create' || before?.assignee_id !== row.assignee_id)) {
      this.#send([row.assignee_id], { title: 'Neue Aufgabe für dich', body: `${actor}: ${row.title}`, path: '/aufgaben' });
    } else if (path === 'items' && action === 'create') {
      this.#queueItem(familyId, user, actor, row);
    }
  }

  // Mehrere Einträge kurz hintereinander → eine Nachricht ("Anna hat Milch, Brot und Eier … hinzugefügt")
  #queueItem(familyId, user, actor, row) {
    const key = `${familyId}:${user.id}:${row.list_id}`;
    let entry = this.#pending.get(key);
    if (!entry) {
      entry = { texts: [] };
      this.#pending.set(key, entry);
      entry.timer = setTimeout(() => {
        this.#pending.delete(key);
        const list = this.#db.prepare('SELECT name FROM lists WHERE id = ?').get(row.list_id);
        if (!list) return;
        this.#send(this.#others(familyId, user.id), {
          title: list.name,
          body: `${actor} hat ${joinGerman(entry.texts)} hinzugefügt`,
          path: `/listen/${row.list_id}`,
        });
      }, this.batchDelayMs);
      entry.timer.unref?.();
    }
    entry.texts.push(row.text);
  }
}

function truncate(text, max) {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export function joinGerman(items) {
  if (items.length > 4) return `${items.slice(0, 3).join(', ')} und ${items.length - 3} weitere`;
  if (items.length === 1) return items[0];
  return `${items.slice(0, -1).join(', ')} und ${items.at(-1)}`;
}

// Termine werden als lokale Uhrzeit ohne Zeitzone gespeichert – also auch ohne Umrechnung formatieren
export function formatEventDate(event) {
  const [date, time] = event.start.split('T');
  const [y, m, d] = date.split('-').map(Number);
  const day = new Intl.DateTimeFormat('de-DE', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })
    .format(new Date(Date.UTC(y, m - 1, d)));
  return event.all_day ? day : `${day}, ${time} Uhr`;
}

// Logos für den Kalender finden: Vereinswappen (TheSportsDB) und Bilder aus Wikipedia-Artikeln,
// außerdem ein Bild über seine Adresse laden (z. B. aus der Google-Bildersuche kopiert).
// Die Bilder lädt der Server, weil der Browser fremde Bilder wegen CORS nicht verkleinern darf.
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { Router } from 'express';
import { isPrivateAddress } from './recipeImport.js';

const SPORTSDB = 'https://www.thesportsdb.com/api/v1/json/123/searchteams.php';
const WIKIPEDIA = 'https://de.wikipedia.org/w/api.php';
const USER_AGENT = 'FamilyConnect/1.0 (private Familien-App)';
const MAX_BYTES = 3 * 1024 * 1024;
const MAX_REDIRECTS = 3;
const IMAGE_TYPES = /^image\/(png|jpeg|webp|gif|svg\+xml)$/;

export class LogoError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export class LogoFinder {
  #fetch;
  #allowPrivate;

  constructor({ fetchImpl = fetch, allowPrivate = false } = {}) {
    this.#fetch = fetchImpl;
    this.#allowPrivate = allowPrivate;
  }

  async #json(url) {
    const res = await this.#fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' }, signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`${res.status}`);
    return res.json();
  }

  async #teams(query) {
    const data = await this.#json(`${SPORTSDB}?t=${encodeURIComponent(query)}`);
    return (data.teams ?? []).filter((t) => t.strBadge).map((t) => ({
      label: t.strTeam,
      detail: [t.strSport === 'Soccer' ? 'Fußball' : t.strSport, t.strCountry].filter(Boolean).join(' · '),
      image: t.strBadge,
      source: 'TheSportsDB',
    }));
  }

  async #wikipedia(query) {
    const params = new URLSearchParams({
      action: 'query', format: 'json', generator: 'search', gsrsearch: query, gsrlimit: '8',
      prop: 'pageimages', piprop: 'thumbnail', pithumbsize: '240',
    });
    const data = await this.#json(`${WIKIPEDIA}?${params}`);
    return Object.values(data.query?.pages ?? {})
      .sort((a, b) => a.index - b.index)
      .filter((p) => p.thumbnail?.source)
      .map((p) => ({ label: p.title, detail: 'Wikipedia', image: p.thumbnail.source, source: 'Wikipedia' }));
  }

  /** Treffer aus beiden Quellen; fällt eine aus, gibt es trotzdem die anderen */
  async search(input) {
    const query = String(input ?? '').trim().slice(0, 80);
    if (query.length < 2) throw new LogoError(400, 'Bitte einen Suchbegriff eingeben');
    const results = await Promise.all([this.#teams(query), this.#wikipedia(query)].map((p) => p.catch(() => [])));
    const seen = new Set();
    return results.flat().filter((r) => !seen.has(r.image) && seen.add(r.image)).slice(0, 16);
  }

  async #checkHost(url) {
    if (this.#allowPrivate) return;
    const host = url.hostname.replace(/^\[|\]$/g, '');
    const addresses = isIP(host) ? [{ address: host }] : await lookup(host, { all: true }).catch(() => []);
    if (addresses.length === 0) throw new LogoError(400, 'Diese Adresse gibt es nicht');
    if (addresses.some((a) => isPrivateAddress(a.address))) throw new LogoError(400, 'Diese Adresse ist nicht erlaubt');
  }

  /** Bild laden (nur öffentliche Adressen, höchstens 3 MB) → data:-URL */
  async download(input) {
    let url;
    try {
      url = new URL(String(input ?? '').trim());
    } catch {
      throw new LogoError(400, 'Das ist keine gültige Bildadresse');
    }
    // Google-Treffer: „…/imgres?imgurl=…“ enthält die eigentliche Bildadresse
    const inner = url.searchParams.get('imgurl');
    if (inner) url = new URL(inner);
    if (!/^https?:$/.test(url.protocol)) throw new LogoError(400, 'Nur http- und https-Adressen');

    for (let i = 0; i <= MAX_REDIRECTS; i++) {
      await this.#checkHost(url);
      let res;
      try {
        res = await this.#fetch(url, {
          redirect: 'manual',
          signal: AbortSignal.timeout(15_000),
          headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36', Accept: 'image/*' },
        });
      } catch {
        throw new LogoError(502, 'Das Bild konnte nicht geladen werden');
      }
      if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
        url = new URL(res.headers.get('location'), url);
        if (!/^https?:$/.test(url.protocol)) throw new LogoError(400, 'Ungültige Weiterleitung');
        continue;
      }
      if (!res.ok) throw new LogoError(502, `Das Bild antwortet mit Fehler ${res.status}`);
      const type = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
      if (!IMAGE_TYPES.test(type)) {
        throw new LogoError(400, 'Unter dieser Adresse ist kein Bild – in Google das Bild öffnen und „Bildadresse kopieren“ nehmen');
      }
      const bytes = await readLimited(res);
      return `data:${type};base64,${bytes.toString('base64')}`;
    }
    throw new LogoError(502, 'Zu viele Weiterleitungen');
  }
}

async function readLimited(res) {
  const reader = res.body?.getReader();
  if (!reader) return Buffer.alloc(0);
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > MAX_BYTES) {
      await reader.cancel();
      throw new LogoError(400, 'Das Bild ist zu groß (höchstens 3 MB)');
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

export function logoSearchRouter({ auth, member, finder }) {
  const router = Router();
  const base = '/api/families/:familyId/logos';
  const handle = (fn) => async (req, res) => {
    try {
      res.json(await fn(req));
    } catch (err) {
      if (!(err instanceof LogoError)) throw err;
      res.status(err.status).json({ error: err.message });
    }
  };
  router.get(`${base}/search`, auth, member, handle(async (req) => finder.search(req.query.q)));
  router.post(`${base}/download`, auth, member, handle(async (req) => ({ image: await finder.download(req.body?.url) })));
  return router;
}

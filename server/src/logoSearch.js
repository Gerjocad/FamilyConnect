// Logos für den Kalender finden: Vereinswappen (TheSportsDB) und Bilder aus Wikipedia-Artikeln,
// außerdem ein Bild über seine Adresse laden (z. B. aus der Google-Bildersuche kopiert).
// Die Bilder lädt der Server, weil der Browser fremde Bilder wegen CORS nicht verkleinern darf.
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { Router } from 'express';
import { isPrivateAddress } from './recipeImport.js';
import { normalize } from './wall.js';

const SPORTSDB_API = 'https://www.thesportsdb.com/api/v1/json/123';
const SPORTSDB = `${SPORTSDB_API}/searchteams.php`;
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

  /**
   * Gegner eines Vereins aus der Sport-Datenbank: alle Mannschaften seiner Liga (über die Spiele der laufenden Saison)
   * und die Gegner der letzten/nächsten Spiele (Pokal, Europapokal). Ergänzt wird aus dem Kalender.
   */
  async opponents(teamName, now = new Date()) {
    const key = normalize(teamName).trim();
    const teams = (await this.#json(`${SPORTSDB}?t=${encodeURIComponent(teamName)}`).catch(() => ({}))).teams ?? [];
    const team = teams.find((t) => normalize(t.strTeam) === key) ?? teams.find((t) => t.strSport === 'Soccer') ?? teams[0];
    if (!team) return [];
    const found = [];
    const fromEvents = (events, league, onlyOwnGames) => {
      for (const e of events ?? []) {
        const home = e.idHomeTeam === team.idTeam;
        const away = e.idAwayTeam === team.idTeam;
        if (onlyOwnGames && !home && !away) continue;
        // eigenes Spiel → nur der Gegner; fremdes Spiel (Liga-Übersicht) → beide Mannschaften
        if (!home) found.push({ name: e.strHomeTeam, badge: e.strHomeTeamBadge || null, source: league ?? e.strLeague });
        if (!away) found.push({ name: e.strAwayTeam, badge: e.strAwayTeamBadge || null, source: league ?? e.strLeague });
      }
    };
    // Saison läuft von Sommer bis Frühjahr: im Oktober 2026 → „2026-2027“
    const year = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
    const season = async () => {
      if (!team.idLeague) return;
      for (const s of [`${year}-${year + 1}`, `${year - 1}-${year}`]) {
        const d = await this.#json(`${SPORTSDB_API}/eventsseason.php?id=${team.idLeague}&s=${s}`);
        if (d.events?.length) return fromEvents(d.events, team.strLeague, false);
      }
    };
    await Promise.all([
      season(),
      this.#json(`${SPORTSDB_API}/eventslast.php?id=${team.idTeam}`).then((d) => fromEvents(d.results, null, true)),
      this.#json(`${SPORTSDB_API}/eventsnext.php?id=${team.idTeam}`).then((d) => fromEvents(d.events, null, true)),
    ].map((r) => r.catch(() => undefined)));
    const own = normalize(team.strTeam).trim();
    return found.filter((o) => o.name && ![key, own].includes(normalize(o.name).trim()));
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

// „Fenerbahçe – Galatasaray“, „Galatasaray vs. Fenerbahçe“, „Fenerbahçe : Beşiktaş (Pokal)“ …
const VERSUS = /\s+(?:[–—-]|vs\.?|gegen|:)\s+/i;

/** Gegner aus Kalendertiteln, in denen das Stichwort vorkommt */
export function opponentsFromTitles(titles, keyword) {
  const key = normalize(keyword).trim();
  const names = [];
  for (const title of titles) {
    if (!normalize(title).includes(key)) continue;
    const parts = title.split(VERSUS);
    if (parts.length < 2) continue;
    for (const part of parts) {
      const name = part.replace(/\(.*?\)/g, '').split(/[,·|]/)[0].replace(/\s+\d+\s*$/, '').trim();
      if (name.length >= 2 && name.length <= 40 && !normalize(name).includes(key)) names.push(name);
    }
  }
  return names;
}

/** Gegner zusammenführen: „Galatasaray“ und „Galatasaray SK“ sind derselbe; Kalender-Schreibweise gewinnt */
export function mergeOpponents(fromCalendar, fromDatabase, existingKeywords) {
  const same = (a, b) => {
    const [x, y] = [normalize(a).trim(), normalize(b).trim()];
    return x === y || x.includes(y) || y.includes(x);
  };
  const result = [];
  for (const name of fromCalendar) {
    const hit = result.find((r) => same(r.name, name));
    if (hit) hit.games++;
    else result.push({ name, badge: null, sources: ['Kalender'], games: 1 });
  }
  for (const o of fromDatabase) {
    const hit = result.find((r) => same(r.name, o.name));
    if (hit) {
      hit.badge ??= o.badge;
      if (!hit.sources.includes(o.source)) hit.sources.push(o.source);
    } else {
      result.push({ name: o.name, badge: o.badge, sources: [o.source], games: 0 });
    }
  }
  return result
    .filter((r) => !existingKeywords.some((k) => same(k, r.name)))
    .sort((a, b) => b.games - a.games || a.name.localeCompare(b.name, 'tr'));
}

export function logoSearchRouter(db, { auth, member, finder }) {
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
  // Alle Gegner eines Vereins, für die es noch kein Logo gibt
  router.get(`${base}/opponents`, auth, member, handle(async (req) => {
    const team = String(req.query.team ?? '').trim().slice(0, 60);
    if (team.length < 2) throw new LogoError(400, 'Welcher Verein?');
    const titles = db.prepare('SELECT title FROM events WHERE family_id = ?').all(req.familyId).map((r) => r.title);
    const existing = db.prepare('SELECT keyword FROM event_icons WHERE family_id = ?').all(req.familyId).map((r) => r.keyword);
    const fromDatabase = await finder.opponents(team).catch(() => []);
    return mergeOpponents(opponentsFromTitles(titles, team), fromDatabase, [...existing, team]);
  }));
  router.post(`${base}/download`, auth, member, handle(async (req) => ({ image: await finder.download(req.body?.url) })));
  return router;
}

// Rezept aus einer Webseite übernehmen.
// 1. Die meisten Rezeptseiten (Chefkoch, Lecker, Kitchen Stories, …) beschreiben ihr Rezept
//    maschinenlesbar als schema.org/Recipe (JSON-LD) – das wird zuerst ausgewertet, kostenlos und ohne KI.
// 2. Fehlt das und ist ein Anthropic-API-Schlüssel hinterlegt, liest Claude das Rezept aus dem Seitentext.
import { lookup } from 'node:dns/promises';
import { existsSync, readFileSync } from 'node:fs';
import { isIP } from 'node:net';

const MAX_HTML_BYTES = 3 * 1024 * 1024;
const MAX_AI_TEXT = 30_000;
const FETCH_TIMEOUT_MS = 12_000;
const AI_TIMEOUT_MS = 60_000;
const MAX_REDIRECTS = 5;
const DEFAULT_MODEL = 'claude-haiku-5-5';

export class RecipeImportError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// --- Hilfsfunktionen ---------------------------------------------------------

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', auml: 'ä', ouml: 'ö', uuml: 'ü', Auml: 'Ä', Ouml: 'Ö', Uuml: 'Ü', szlig: 'ß', deg: '°', frac12: '½', frac14: '¼', frac34: '¾', ndash: '–', mdash: '—', hellip: '…' };

export function decodeEntities(text) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+\d*);/gi, (match, code) => {
    if (code[0] === '#') {
      const n = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : Number(code.slice(1));
      return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : match;
    }
    return ENTITIES[code] ?? match;
  });
}

/** HTML-Reste entfernen, Leerraum zusammenfassen */
function clean(value, max = 5000) {
  if (typeof value !== 'string') return '';
  return decodeEntities(value.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ' '))
    .replace(/[ \t ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .trim()
    .slice(0, max);
}

/** ISO-8601-Dauer (PT1H30M) → „1 Std. 30 Min.“ */
export function formatDuration(iso) {
  const m = typeof iso === 'string' && /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:[\d.]+S)?)?$/i.exec(iso.trim());
  if (!m) return '';
  const minutes = Number(m[1] ?? 0) * 1440 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
  if (!minutes) return '';
  const h = Math.floor(minutes / 60);
  const min = minutes % 60;
  return [h && `${h} Std.`, min && `${min} Min.`].filter(Boolean).join(' ');
}

function isoMinutes(iso) {
  const m = typeof iso === 'string' && /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?)?/i.exec(iso.trim());
  return m ? Number(m[1] ?? 0) * 1440 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0) : 0;
}

function parseServings(value) {
  const raw = Array.isArray(value) ? value.find((v) => /\d/.test(String(v))) ?? value[0] : value;
  const n = Number.parseInt(String(raw ?? ''), 10);
  return Number.isInteger(n) && n >= 1 && n <= 100 ? n : null;
}

function firstImage(image) {
  if (!image) return '';
  if (typeof image === 'string') return image;
  if (Array.isArray(image)) return firstImage(image[0]);
  return typeof image.url === 'string' ? image.url : typeof image['@id'] === 'string' ? image['@id'] : '';
}

const hasType = (node, type) => {
  const t = node?.['@type'];
  return Array.isArray(t) ? t.includes(type) : t === type;
};

/** Sucht in beliebig verschachteltem JSON-LD (Arrays, @graph, mainEntity) den ersten Recipe-Knoten */
function findRecipe(node, depth = 0) {
  if (!node || typeof node !== 'object' || depth > 6) return null;
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findRecipe(child, depth + 1);
      if (found) return found;
    }
    return null;
  }
  if (hasType(node, 'Recipe')) return node;
  return findRecipe(node['@graph'], depth + 1) ?? findRecipe(node.mainEntity, depth + 1);
}

/** recipeInstructions kann Text, eine Liste von Texten, HowToStep oder HowToSection sein */
function instructionLines(value, depth = 0) {
  if (!value || depth > 4) return [];
  if (typeof value === 'string') return clean(value, 20_000).split('\n').map((l) => l.trim()).filter(Boolean);
  if (Array.isArray(value)) return value.flatMap((v) => instructionLines(v, depth + 1));
  if (hasType(value, 'HowToSection')) {
    const steps = instructionLines(value.itemListElement, depth + 1);
    return value.name ? [`${clean(value.name, 200)}:`, ...steps] : steps;
  }
  return instructionLines(value.text ?? value.name ?? value.itemListElement, depth + 1);
}

function categoryOf(value) {
  const first = Array.isArray(value) ? value[0] : value;
  return clean(typeof first === 'string' ? first.split(',')[0] : '', 100);
}

/** schema.org/Recipe → unser Rezeptformat */
export function fromJsonLd(recipe, url) {
  const ingredients = (Array.isArray(recipe.recipeIngredient) ? recipe.recipeIngredient : recipe.ingredients ?? [])
    .map((i) => clean(String(i), 200))
    .filter(Boolean);
  const totalMinutes = isoMinutes(recipe.totalTime) || isoMinutes(recipe.prepTime) + isoMinutes(recipe.cookTime);
  const duration = totalMinutes ? formatDuration(`PT${totalMinutes}M`) : '';
  return {
    title: clean(recipe.name, 200),
    category: categoryOf(recipe.recipeCategory),
    servings: parseServings(recipe.recipeYield),
    duration,
    ingredients: ingredients.join('\n').slice(0, 10_000),
    instructions: instructionLines(recipe.recipeInstructions).join('\n').slice(0, 20_000),
    notes: clean(recipe.description, 2000),
    source_url: url,
    image_url: absoluteUrl(firstImage(recipe.image), url),
  };
}

function absoluteUrl(value, base) {
  if (!value) return '';
  try {
    const u = new URL(value, base);
    return /^https?:$/.test(u.protocol) ? u.href.slice(0, 1000) : '';
  } catch {
    return '';
  }
}

export function extractJsonLd(html) {
  const blocks = html.matchAll(/<script[^>]*type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi);
  for (const [, content] of blocks) {
    let data;
    try {
      data = JSON.parse(content.trim());
    } catch {
      // Manche Seiten haben Steuerzeichen im JSON
      try {
        data = JSON.parse(content.trim().replace(/[\u0000-\u001f]+/g, ' '));
      } catch {
        continue;
      }
    }
    const recipe = findRecipe(data);
    if (recipe) return recipe;
  }
  return null;
}

function metaContent(html, property) {
  const re = new RegExp(`<meta[^>]+(?:property|name)=["']${property}["'][^>]*>`, 'i');
  const tag = re.exec(html)?.[0];
  return tag ? decodeEntities(/content=["']([^"']*)["']/i.exec(tag)?.[1] ?? '') : '';
}

/** Sichtbarer Seitentext für die KI (ohne Skripte, Navigation, …) */
export function pageText(html) {
  return clean(
    html
      .replace(/<(script|style|noscript|svg|nav|footer|header|form|iframe)[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<\/(p|div|li|h\d|tr|section|article)>/gi, '\n'),
    MAX_AI_TEXT * 2
  ).replace(/\n{2,}/g, '\n').slice(0, MAX_AI_TEXT);
}

// --- Schutz vor Zugriffen ins interne Netz ----------------------------------

function isPrivateAddress(address) {
  if (isIP(address) === 4) {
    const [a, b] = address.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const v6 = address.toLowerCase();
  if (v6.startsWith('::ffff:')) return isPrivateAddress(v6.slice(7));
  return v6 === '::' || v6 === '::1' || v6.startsWith('fc') || v6.startsWith('fd') || v6.startsWith('fe80');
}

// --- Import ------------------------------------------------------------------

export class RecipeImporter {
  #fetch;
  #allowPrivate;
  #apiKey;
  #apiKeyFile;
  #model;

  /**
   * @param apiKey      Anthropic-API-Schlüssel (optional)
   * @param apiKeyFile  Datei mit dem Schlüssel; wird bei jedem Import gelesen, ein Neustart ist also nicht nötig
   */
  constructor({ fetchImpl = fetch, allowPrivate = false, apiKey, apiKeyFile, model } = {}) {
    this.#fetch = fetchImpl;
    this.#allowPrivate = allowPrivate;
    this.#apiKey = apiKey;
    this.#apiKeyFile = apiKeyFile;
    this.#model = model || DEFAULT_MODEL;
  }

  #key() {
    if (this.#apiKey) return this.#apiKey;
    if (this.#apiKeyFile && existsSync(this.#apiKeyFile)) {
      try {
        return readFileSync(this.#apiKeyFile, 'utf8').trim() || null;
      } catch {
        return null;
      }
    }
    return null;
  }

  get aiEnabled() {
    return Boolean(this.#key());
  }

  async #checkHost(url) {
    if (this.#allowPrivate) return;
    const host = url.hostname.replace(/^\[|\]$/g, '');
    const addresses = isIP(host) ? [{ address: host }] : await lookup(host, { all: true }).catch(() => []);
    if (addresses.length === 0) throw new RecipeImportError(400, 'Diese Adresse gibt es nicht');
    if (addresses.some((a) => isPrivateAddress(a.address))) throw new RecipeImportError(400, 'Diese Adresse ist nicht erlaubt');
  }

  async #download(input) {
    let url = input;
    for (let i = 0; i <= MAX_REDIRECTS; i++) {
      await this.#checkHost(url);
      let res;
      try {
        res = await this.#fetch(url, {
          redirect: 'manual',
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
          headers: {
            // Manche Seiten liefern ohne Browser-Kennung nichts aus
            'User-Agent': 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36',
            Accept: 'text/html,application/xhtml+xml',
            'Accept-Language': 'de-DE,de;q=0.9,en;q=0.5',
          },
        });
      } catch {
        throw new RecipeImportError(502, 'Die Seite konnte nicht geladen werden');
      }
      if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
        url = new URL(res.headers.get('location'), url);
        if (!/^https?:$/.test(url.protocol)) throw new RecipeImportError(400, 'Ungültige Weiterleitung');
        continue;
      }
      if (!res.ok) throw new RecipeImportError(502, `Die Seite antwortet mit Fehler ${res.status}`);
      return { html: await readLimited(res), url: url.href };
    }
    throw new RecipeImportError(502, 'Zu viele Weiterleitungen');
  }

  /** Liefert einen Rezept-Entwurf (wird nicht gespeichert) */
  async fromUrl(input) {
    let url;
    try {
      url = new URL(String(input ?? '').trim());
    } catch {
      throw new RecipeImportError(400, 'Bitte einen vollständigen Link eingeben (https://…)');
    }
    if (!/^https?:$/.test(url.protocol)) throw new RecipeImportError(400, 'Bitte einen Link mit http:// oder https:// eingeben');

    return this.#parse(await this.#download(url));
  }

  /** Seite, die das Handy selbst geladen hat (manche Seiten sperren Server-Zugriffe) */
  async fromHtml(html, input) {
    let url;
    try {
      url = new URL(String(input ?? ''));
    } catch {
      throw new RecipeImportError(400, 'Ungültiger Link');
    }
    if (typeof html !== 'string' || !html) throw new RecipeImportError(400, 'Die Seite ist leer');
    return this.#parse({ html: html.slice(0, MAX_HTML_BYTES), url: url.href });
  }

  async #parse(page) {
    const recipe = extractJsonLd(page.html);
    if (recipe) {
      const draft = fromJsonLd(recipe, page.url);
      if (draft.title && (draft.ingredients || draft.instructions)) return { ...draft, method: 'schema' };
    }
    if (!this.aiEnabled) {
      throw new RecipeImportError(422, 'Auf dieser Seite wurde kein Rezept erkannt. Mit hinterlegtem KI-Schlüssel kann FamilyConnect auch solche Seiten auslesen.');
    }
    const text = pageText(page.html);
    if (text.length < 50) throw new RecipeImportError(422, 'Die Seite enthält kaum Text – vermutlich wird sie erst im Browser aufgebaut.');
    const draft = await this.#ai(`Titel der Seite: ${metaContent(page.html, 'og:title')}\n\n${text}`);
    return { ...draft, source_url: page.url, image_url: draft.image_url || absoluteUrl(metaContent(page.html, 'og:image'), page.url), method: 'ai' };
  }

  /** Eingefügter Text (z. B. aus einer Nachricht oder einem Video-Text) – nur mit KI */
  async fromText(input) {
    const text = String(input ?? '').trim().slice(0, MAX_AI_TEXT);
    if (text.length < 20) throw new RecipeImportError(400, 'Bitte den Rezepttext einfügen');
    if (!this.aiEnabled) throw new RecipeImportError(422, 'Zum Auslesen von Text ist ein KI-Schlüssel auf dem Server nötig');
    return { ...(await this.#ai(text)), source_url: '', image_url: '', method: 'ai' };
  }

  async #ai(text) {
    const prompt = `Lies aus dem folgenden Text ein Kochrezept aus und antworte NUR mit einem JSON-Objekt (ohne Erklärung, ohne Markdown) mit diesen Feldern:
{"found": true/false, "title": "...", "category": "z. B. Hauptgericht, Dessert, Kuchen", "servings": Zahl oder null, "duration": "z. B. 45 Min.", "ingredients": ["200 g Mehl", "2 Eier"], "instructions": ["Schritt 1", "Schritt 2"], "notes": "kurze Beschreibung oder leer"}
Regeln: Zutaten mit Menge vorne, eine Zutat pro Eintrag. Schritte vollständig übernehmen. Alles auf Deutsch (übersetzen, falls nötig). Steht kein Rezept im Text, antworte {"found": false}.

<text>
${text}
</text>`;
    let res;
    try {
      res = await this.#fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        signal: AbortSignal.timeout(AI_TIMEOUT_MS),
        headers: { 'content-type': 'application/json', 'x-api-key': this.#key(), 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: this.#model, max_tokens: 4000, messages: [{ role: 'user', content: prompt }] }),
      });
    } catch {
      throw new RecipeImportError(502, 'Die KI ist gerade nicht erreichbar');
    }
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      console.error(`Rezept-KI: Fehler ${res.status} ${detail.slice(0, 300)}`);
      throw new RecipeImportError(502, res.status === 401 ? 'Der KI-Schlüssel auf dem Server ist ungültig' : 'Die KI konnte das Rezept nicht auslesen');
    }
    const body = await res.json();
    const answer = body.content?.filter((c) => c.type === 'text').map((c) => c.text).join('') ?? '';
    let data;
    try {
      data = JSON.parse(answer.slice(answer.indexOf('{'), answer.lastIndexOf('}') + 1));
    } catch {
      throw new RecipeImportError(502, 'Die KI-Antwort war unverständlich – bitte nochmal versuchen');
    }
    if (!data.found || !data.title) throw new RecipeImportError(422, 'In diesem Text wurde kein Rezept gefunden');
    const lines = (v) => (Array.isArray(v) ? v : String(v ?? '').split('\n')).map((l) => clean(String(l), 2000)).filter(Boolean);
    return {
      title: clean(data.title, 200),
      category: clean(data.category, 100),
      servings: parseServings(data.servings),
      duration: clean(data.duration, 50),
      ingredients: lines(data.ingredients).map((l) => l.slice(0, 200)).join('\n').slice(0, 10_000),
      instructions: lines(data.instructions).join('\n').slice(0, 20_000),
      notes: clean(data.notes, 2000),
      image_url: '',
    };
  }
}

async function readLimited(res) {
  const reader = res.body?.getReader();
  if (!reader) return '';
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    chunks.push(value);
    if (size > MAX_HTML_BYTES) {
      await reader.cancel();
      break;
    }
  }
  return Buffer.concat(chunks).toString('utf8');
}

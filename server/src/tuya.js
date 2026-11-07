// Thermometer, Lampen und Steckdosen über die Tuya-Cloud (Smart Life). Zugangsdaten liegen nur auf dem Server
// (/etc/familyconnect/tuya.json, siehe deploy/TUYA.md) und werden bei Bedarf gelesen.
// Signatur nach https://developer.tuya.com/en/docs/iot/new-singnature
import { createHash, createHmac, randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';

const ENDPOINTS = {
  eu: 'https://openapi.tuyaeu.com',
  us: 'https://openapi.tuyaus.com',
  cn: 'https://openapi.tuyacn.com',
  in: 'https://openapi.tuyain.com',
};
const STATUS_CACHE_MS = 2 * 60 * 1000;
const DEVICES_CACHE_MS = 10 * 60 * 1000;

// Übliche Datenpunkte von Thermo-/Hygrometern
const TEMPERATURE = ['va_temperature', 'temp_current', 'temp_indoor', 'temperature'];
const HUMIDITY = ['va_humidity', 'humidity_value', 'humidity_indoor', 'humidity'];
const BATTERY = ['battery_percentage', 'va_battery', 'battery'];
const BATTERY_STATE = { low: 10, middle: 50, high: 100 };
// Hersteller benennen Datenpunkte unterschiedlich – notfalls nach Namensteil suchen (ohne Grenzwerte/Alarme)
const NOT_A_READING = /alarm|set|max|min|unit|switch|calib|sensitivity|report|period/i;
const FALLBACK = { temperature: /temp/i, humidity: /humi/i, battery: /batt/i };

/** Wo der Gerätestatus herkommt – je nach Projekt und Steuerungsmodus liefert nur eine davon Werte */
const statusSources = (id) => [
  { path: `/v1.0/iot-03/devices/${id}/status`, pick: (r) => r },
  { path: `/v1.0/devices/${id}/status`, pick: (r) => r },
  { path: `/v2.0/cloud/thing/${id}/shadow/properties`, pick: (r) => r?.properties },
  { path: `/v1.0/devices/${id}`, pick: (r) => r?.status },
];

// Schalten: Lampen (switch_led) und Steckdosen (switch_1, switch); Helligkeit je nach Gerät
const SWITCH = ['switch_led', 'switch_led_1', 'switch_1', 'switch', 'switch_on'];
const BRIGHTNESS = ['bright_value_v2', 'bright_value', 'bright_value_1'];
/** Tuya-Kategorien von Lampen und Steckdosen/Schaltern */
export const LIGHT_CATEGORIES = ['dj', 'dd', 'xdd', 'fwd', 'dc', 'tgq', 'tgkg', 'fsd', 'gyd', 'tyndj', 'sxd', 'mbd'];
export const PLUG_CATEGORIES = ['cz', 'pc', 'kg', 'qjdcz', 'wkcz', 'dlq'];

const toNumber = (v) => (typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : null);

export class TuyaError extends Error {
  constructor(message, { expired = false } = {}) {
    super(message);
    this.expired = expired;
  }
}

const sha256 = (text) => createHash('sha256').update(text).digest('hex');

export class TuyaClient {
  #configFile;
  #fetch;
  #config = null;
  #token = null;
  #tokenExpires = 0;
  #statusCache = new Map();
  #devices = null;
  #devicesAt = 0;

  /** @param config  direkt übergeben (Tests) oder aus `configFile` gelesen */
  constructor({ configFile, config, fetchImpl = fetch } = {}) {
    this.#configFile = configFile;
    this.#config = config ?? null;
    this.#fetch = fetchImpl;
  }

  #readConfig() {
    if (this.#config) return this.#config;
    if (!this.#configFile || !existsSync(this.#configFile)) return null;
    try {
      const data = JSON.parse(readFileSync(this.#configFile, 'utf8'));
      if (!data.access_id || !data.access_secret) throw new Error('access_id oder access_secret fehlt');
      return data;
    } catch (err) {
      console.error(`Tuya: ${this.#configFile} ist ungültig (${err.message})`);
      return null;
    }
  }

  get enabled() {
    return Boolean(this.#readConfig());
  }

  #sign(config, { method, path, body = '', token = '' }) {
    const t = String(Date.now());
    const nonce = randomUUID();
    const stringToSign = [method, sha256(body), '', path].join('\n');
    const sign = createHmac('sha256', config.access_secret)
      .update(config.access_id + token + t + nonce + stringToSign)
      .digest('hex')
      .toUpperCase();
    return {
      client_id: config.access_id,
      sign,
      t,
      nonce,
      sign_method: 'HMAC-SHA256',
      ...(token && { access_token: token }),
      ...(body && { 'Content-Type': 'application/json' }),
    };
  }

  async #call(config, method, path, { body, token } = {}) {
    const base = ENDPOINTS[config.region ?? 'eu'] ?? ENDPOINTS.eu;
    const payload = body === undefined ? '' : JSON.stringify(body);
    let res;
    try {
      res = await this.#fetch(base + path, {
        method,
        headers: this.#sign(config, { method, path, body: payload, token }),
        body: payload || undefined,
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      throw new TuyaError('Tuya ist gerade nicht erreichbar');
    }
    const data = await res.json().catch(() => ({}));
    if (!data.success) {
      const msg = String(data.msg ?? `Fehler ${res.status}`);
      // Testphase des Cloud-Projekts abgelaufen (muss bei Tuya verlängert werden)
      const expired = /expire|subscri|trial/i.test(msg) || data.code === 28841105 || data.code === 28841002;
      const error = new TuyaError(expired ? 'Die Tuya-Testphase ist abgelaufen – bitte auf platform.tuya.com verlängern' : `Tuya: ${msg}`, { expired });
      error.code = data.code;
      throw error;
    }
    return data.result;
  }

  async #accessToken(config) {
    if (this.#token && Date.now() < this.#tokenExpires) return this.#token;
    const result = await this.#call(config, 'GET', '/v1.0/token?grant_type=1');
    this.#token = result.access_token;
    // etwas früher erneuern als nötig
    this.#tokenExpires = Date.now() + (result.expire_time - 60) * 1000;
    return this.#token;
  }

  /** Anfrage mit Zugangs-Token; ein abgelaufenes Token wird einmal erneuert */
  async request(method, path, body) {
    const config = this.#readConfig();
    if (!config) throw new TuyaError('Tuya ist nicht eingerichtet');
    try {
      return await this.#call(config, method, path, { body, token: await this.#accessToken(config) });
    } catch (err) {
      if (err.code !== 1010 && err.code !== 1011) throw err;
      this.#token = null;
      return this.#call(config, method, path, { body, token: await this.#accessToken(config) });
    }
  }

  /** Alle Geräte des Cloud-Projekts: [{ id, name, category, online }] */
  async devices() {
    if (this.#devices && Date.now() - this.#devicesAt < DEVICES_CACHE_MS) return this.#devices;
    // Je nach Projekt-Typ liefert eine andere Schnittstelle die Liste: zuerst die Geräte der verknüpften
    // Smart-Life-Konten, dann die neueren Projekt-Listen
    const sources = [
      async () => {
        const list = [];
        let lastRowKey = '';
        for (let page = 0; page < 10; page++) {
          const result = await this.request('GET', `/v1.0/iot-01/associated-users/devices?${lastRowKey ? `last_row_key=${lastRowKey}&` : ''}size=50`);
          list.push(...(result?.devices ?? []));
          if (!result?.has_more || !result.last_row_key) break;
          lastRowKey = result.last_row_key;
        }
        return list;
      },
      async () => {
        const result = await this.request('GET', '/v2.0/cloud/thing/device?page_size=50');
        return Array.isArray(result) ? result : result?.list ?? [];
      },
      async () => (await this.request('GET', '/v1.0/iot-03/devices?page_size=50'))?.list ?? [],
    ];
    let list = null;
    let firstError = null;
    for (const source of sources) {
      try {
        list = await source();
        break;
      } catch (err) {
        if (err.expired) throw err;
        firstError ??= err;
      }
    }
    if (!list) throw firstError;
    this.#devices = list.map((d) => ({
      id: d.id,
      name: d.customName || d.name || d.id,
      category: d.category ?? '',
      online: Boolean(d.isOnline ?? d.online),
    }));
    this.#devicesAt = Date.now();
    return this.#devices;
  }

  /** Erste Schnittstelle, die antwortet (ältere und neuere Projekte kennen unterschiedliche Pfade) */
  async #firstOf(paths) {
    let firstError = null;
    for (const path of paths) {
      try {
        return await this.request('GET', path);
      } catch (err) {
        if (err.expired) throw err;
        firstError ??= err;
      }
    }
    throw firstError;
  }

  /** Gerätebeschreibung: { code: { scale, min, max } } – wird gemerkt, ändert sich nicht */
  #specCache = new Map();
  async #spec(id) {
    if (this.#specCache.has(id)) return this.#specCache.get(id);
    try {
      const spec = await this.#firstOf([`/v1.0/iot-03/devices/${id}/specification`, `/v1.0/devices/${id}/specifications`]);
      const out = {};
      for (const s of [...(spec?.functions ?? []), ...(spec?.status ?? [])]) {
        let v = {};
        try {
          v = JSON.parse(s.values ?? '{}');
        } catch { /* egal */ }
        out[s.code] ??= { scale: v.scale ?? 0, min: toNumber(v.min), max: toNumber(v.max) };
      }
      this.#specCache.set(id, out);
      return out;
    } catch (err) {
      if (err.expired) throw err;
      return {};
    }
  }

  /** Schaltzustand einer Lampe/Steckdose: { on, brightness (0–100 oder null), switch_code, bright_code } */
  async switchState(id) {
    const [status, spec] = await Promise.all([this.#status(id), this.#spec(id)]);
    if (!status.source) throw new TuyaError('Das Gerät meldet keinen Zustand');
    const sw = SWITCH.map((c) => status.points.find((p) => p.code === c && typeof p.value === 'boolean')).find(Boolean)
      ?? status.points.find((p) => /^switch/.test(p.code) && typeof p.value === 'boolean');
    const br = BRIGHTNESS.map((c) => status.points.find((p) => p.code === c && toNumber(p.value) !== null)).find(Boolean);
    let brightness = null;
    if (br) {
      const { min = 10, max = br.code === 'bright_value' ? 255 : 1000 } = Object.fromEntries(Object.entries(spec[br.code] ?? {}).filter(([, v]) => v !== null));
      brightness = Math.max(1, Math.min(100, Math.round(((toNumber(br.value) - min) / (max - min)) * 100)));
    }
    return { on: sw ? sw.value : null, brightness, switch_code: sw?.code ?? null, bright_code: br?.code ?? null };
  }

  /** Lampe/Steckdose schalten: { on: true/false } und/oder { brightness: 1–100 } */
  async setSwitch(id, { on, brightness }) {
    const state = await this.switchState(id);
    const commands = [];
    if (on !== undefined) {
      if (!state.switch_code) throw new TuyaError('Dieses Gerät kann die App nicht schalten');
      commands.push({ code: state.switch_code, value: on });
    }
    if (brightness !== undefined) {
      if (!state.bright_code) throw new TuyaError('Dieses Gerät ist nicht dimmbar');
      const spec = (await this.#spec(id))[state.bright_code] ?? {};
      const min = spec.min ?? 10;
      const max = spec.max ?? (state.bright_code === 'bright_value' ? 255 : 1000);
      commands.push({ code: state.bright_code, value: Math.round(min + (brightness / 100) * (max - min)) });
    }
    let firstError = null;
    for (const path of [`/v1.0/iot-03/devices/${id}/commands`, `/v1.0/devices/${id}/commands`]) {
      try {
        await this.request('POST', path, { commands });
        return;
      } catch (err) {
        if (err.expired) throw err;
        firstError ??= err;
      }
    }
    throw firstError;
  }

  /** Kommastellen je Datenpunkt aus der Gerätebeschreibung (z. B. va_temperature: 215 → 21,5 °C) */
  async #scales(id) {
    try {
      const spec = await this.#firstOf([`/v1.0/iot-03/devices/${id}/specification`, `/v1.0/devices/${id}/specifications`]);
      return Object.fromEntries((spec?.status ?? []).map((s) => {
        try {
          return [s.code, JSON.parse(s.values ?? '{}').scale ?? 0];
        } catch {
          return [s.code, 0];
        }
      }));
    } catch {
      return {};
    }
  }

  /** Erste Statusquelle mit Datenpunkten: { points: [{ code, value }], source, errors } */
  async #status(id) {
    const errors = [];
    for (const { path, pick } of statusSources(id)) {
      try {
        const points = pick(await this.request('GET', path));
        if (Array.isArray(points) && points.length > 0) {
          return { points: points.map((p) => ({ code: String(p.code ?? p.dp_id ?? ''), value: p.value })), source: path, errors };
        }
        errors.push(`${path}: keine Datenpunkte`);
      } catch (err) {
        if (err.expired) throw err;
        errors.push(`${path}: ${err.message}`);
      }
    }
    return { points: [], source: null, errors };
  }

  #parse(points, scales) {
    const find = (codes, fallback) =>
      points.find((p) => codes.includes(p.code) && toNumber(p.value) !== null)
      ?? points.find((p) => fallback.test(p.code) && !NOT_A_READING.test(p.code) && toNumber(p.value) !== null);
    const value = (codes, fallback, maxPlain) => {
      const point = find(codes, fallback);
      if (!point) return null;
      const raw = toNumber(point.value);
      const scale = scales[point.code] ?? (Math.abs(raw) > maxPlain ? 1 : 0);
      return Math.round((raw / 10 ** scale) * 10) / 10;
    };
    const batteryState = points.find((p) => p.code === 'battery_state')?.value;
    return {
      temperature: value(TEMPERATURE, FALLBACK.temperature, 100),
      humidity: value(HUMIDITY, FALLBACK.humidity, 100),
      battery: value(BATTERY, FALLBACK.battery, 100) ?? BATTERY_STATE[batteryState] ?? null,
    };
  }

  /** Messwerte eines Thermometers: { temperature, humidity, battery, updated_at } */
  async climate(id) {
    const cached = this.#statusCache.get(id);
    if (cached && Date.now() - cached.at < STATUS_CACHE_MS) return cached.data;
    const [status, scales] = await Promise.all([
      this.#status(id),
      cached?.scales ? Promise.resolve(cached.scales) : this.#scales(id),
    ]);
    if (!status.source) throw new TuyaError('Das Thermometer liefert keine Werte – siehe „Werte testen“ in den Einstellungen');
    const data = { ...this.#parse(status.points, scales), updated_at: new Date().toISOString() };
    this.#statusCache.set(id, { at: Date.now(), data, scales });
    return data;
  }

  /** Diagnose für die Einstellungen: was das Gerät wirklich meldet und was die App daraus liest */
  async diagnose(id) {
    const [status, scales] = await Promise.all([this.#status(id), this.#scales(id)]);
    this.#statusCache.delete(id);
    return { ...status, scales, parsed: this.#parse(status.points, scales) };
  }
}

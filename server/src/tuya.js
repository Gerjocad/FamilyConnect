// Thermometer über die Tuya-Cloud (Smart Life). Zugangsdaten liegen nur auf dem Server
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
    let list;
    try {
      const result = await this.request('GET', '/v2.0/cloud/thing/device?page_size=50');
      list = Array.isArray(result) ? result : result?.list ?? [];
    } catch (err) {
      if (err.expired) throw err;
      // ältere Projekte: Liste über die IoT-Core-Schnittstelle
      const result = await this.request('GET', '/v1.0/iot-03/devices?page_size=50');
      list = result?.list ?? [];
    }
    this.#devices = list.map((d) => ({
      id: d.id,
      name: d.customName || d.name || d.id,
      category: d.category ?? '',
      online: Boolean(d.isOnline ?? d.online),
    }));
    this.#devicesAt = Date.now();
    return this.#devices;
  }

  /** Kommastellen je Datenpunkt aus der Gerätebeschreibung (z. B. va_temperature: 215 → 21,5 °C) */
  async #scales(id) {
    try {
      const spec = await this.request('GET', `/v1.0/iot-03/devices/${id}/specification`);
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

  /** Messwerte eines Thermometers: { temperature, humidity, battery, updated_at } */
  async climate(id) {
    const cached = this.#statusCache.get(id);
    if (cached && Date.now() - cached.at < STATUS_CACHE_MS) return cached.data;
    const [status, scales] = await Promise.all([
      this.request('GET', `/v1.0/iot-03/devices/${id}/status`),
      cached?.scales ? Promise.resolve(cached.scales) : this.#scales(id),
    ]);
    const value = (codes) => {
      const point = status?.find((s) => codes.includes(s.code));
      if (!point || typeof point.value !== 'number') return null;
      const scale = scales[point.code] ?? (Math.abs(point.value) > 100 ? 1 : 0);
      return Math.round((point.value / 10 ** scale) * 10) / 10;
    };
    const batteryState = status?.find((s) => s.code === 'battery_state')?.value;
    const data = {
      temperature: value(TEMPERATURE),
      humidity: value(HUMIDITY),
      battery: value(BATTERY) ?? BATTERY_STATE[batteryState] ?? null,
      updated_at: new Date().toISOString(),
    };
    this.#statusCache.set(id, { at: Date.now(), data, scales });
    return data;
  }
}

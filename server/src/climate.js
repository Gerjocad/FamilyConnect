// Raumklima: welche Tuya-Thermometer eine Familie sieht, mit Namen und Grenzwerten,
// und Push-Warnungen an die Eltern, wenn ein Wert die Grenze überschreitet.
import { Router } from 'express';
import { isManager } from './permissions.js';
import { TuyaError } from './tuya.js';

const LIMITS = ['min_temp', 'max_temp', 'min_humidity', 'max_humidity'];
const LOW_BATTERY = 15;

const sensorsOf = (db, familyId) =>
  db.prepare('SELECT * FROM climate_sensors WHERE family_id = ? ORDER BY position, device_id').all(familyId);

/** Welche Grenzen gerade verletzt sind, z. B. ['max_humidity'] */
export function violations(sensor, data) {
  const out = [];
  if (data.temperature !== null) {
    if (sensor.min_temp !== null && data.temperature < sensor.min_temp) out.push('min_temp');
    if (sensor.max_temp !== null && data.temperature > sensor.max_temp) out.push('max_temp');
  }
  if (data.humidity !== null) {
    if (sensor.min_humidity !== null && data.humidity < sensor.min_humidity) out.push('min_humidity');
    if (sensor.max_humidity !== null && data.humidity > sensor.max_humidity) out.push('max_humidity');
  }
  if (data.battery !== null && data.battery <= LOW_BATTERY) out.push('battery');
  return out;
}

const fmt = (n) => String(n).replace('.', ',');
const MESSAGES = {
  min_temp: (s, d) => `nur ${fmt(d.temperature)} °C – zu kalt (unter ${fmt(s.min_temp)} °C)`,
  max_temp: (s, d) => `${fmt(d.temperature)} °C – zu warm (über ${fmt(s.max_temp)} °C)`,
  min_humidity: (s, d) => `nur ${fmt(d.humidity)} % Luftfeuchtigkeit – zu trocken`,
  max_humidity: (s, d) => `${fmt(d.humidity)} % Luftfeuchtigkeit – bitte lüften!`,
  battery: (s, d) => `Batterie fast leer (${d.battery} %)`,
};

/**
 * Prüft alle Thermometer mit Grenzwerten und meldet neue Überschreitungen den Eltern.
 * Wer schon gewarnt wurde, bekommt erst wieder Bescheid, wenn der Wert zwischendurch normal war.
 */
export async function checkClimateAlerts(db, tuya, push) {
  if (!tuya.enabled) return;
  const sensors = db.prepare('SELECT * FROM climate_sensors').all();
  for (const sensor of sensors) {
    let data;
    try {
      data = await tuya.climate(sensor.device_id);
    } catch (err) {
      console.error(`Raumklima ${sensor.device_id}: ${err.message}`);
      continue;
    }
    const now = violations(sensor, data);
    const before = JSON.parse(sensor.alert_state || '[]');
    const fresh = now.filter((v) => !before.includes(v));
    if (fresh.length) {
      const parents = db.prepare("SELECT user_id FROM memberships WHERE family_id = ? AND role IN ('admin', 'parent')")
        .all(sensor.family_id).map((r) => r.user_id);
      push?.notify(parents, {
        title: `🌡️ ${sensor.label || 'Thermometer'}`,
        body: fresh.map((v) => MESSAGES[v](sensor, data)).join(' · '),
        path: '/',
      });
    }
    if (JSON.stringify(now) !== JSON.stringify(before)) {
      db.prepare('UPDATE climate_sensors SET alert_state = ? WHERE family_id = ? AND device_id = ?')
        .run(JSON.stringify(now), sensor.family_id, sensor.device_id);
    }
  }
}

export function climateRouter(db, { auth, member, publish, tuya }) {
  const router = Router();
  const base = '/api/families/:familyId/climate';

  const fail = (res, err) => {
    if (!(err instanceof TuyaError)) throw err;
    res.status(502).json({ error: err.message, expired: err.expired });
  };

  // Messwerte der ausgewählten Thermometer – für alle Familienmitglieder
  router.get(base, auth, member, async (req, res) => {
    const sensors = sensorsOf(db, req.familyId);
    if (!tuya.enabled) return res.json({ enabled: false, sensors: [] });
    const result = await Promise.all(sensors.map(async (s) => {
      try {
        const data = await tuya.climate(s.device_id);
        return { device_id: s.device_id, label: s.label, ...data, warnings: violations(s, data), error: null };
      } catch (err) {
        if (!(err instanceof TuyaError)) throw err;
        return { device_id: s.device_id, label: s.label, temperature: null, humidity: null, battery: null, warnings: [], error: err.message, expired: err.expired };
      }
    }));
    res.json({ enabled: true, sensors: result });
  });

  // Einstellungen: alle Geräte des Tuya-Projekts mit Auswahl, Namen und Grenzwerten (nur Admins)
  router.get(`${base}/devices`, auth, member, async (req, res) => {
    if (req.role !== 'admin') return res.status(403).json({ error: 'Nur Admins' });
    if (!tuya.enabled) return res.json({ enabled: false, devices: [] });
    try {
      const chosen = new Map(sensorsOf(db, req.familyId).map((s) => [s.device_id, s]));
      const devices = await tuya.devices();
      res.json({
        enabled: true,
        devices: devices.map((d) => {
          const s = chosen.get(d.id);
          return { ...d, selected: Boolean(s), label: s?.label ?? d.name, ...Object.fromEntries(LIMITS.map((k) => [k, s?.[k] ?? null])) };
        }),
      });
    } catch (err) {
      fail(res, err);
    }
  });

  router.put(`${base}/devices`, auth, member, (req, res) => {
    if (req.role !== 'admin') return res.status(403).json({ error: 'Nur Admins' });
    const list = Array.isArray(req.body?.devices) ? req.body.devices : null;
    if (!list || list.length > 20) return res.status(400).json({ error: 'Ungültige Auswahl' });
    const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v));
    const rows = [];
    for (const d of list) {
      if (typeof d?.id !== 'string' || !/^[\w-]{1,64}$/.test(d.id)) return res.status(400).json({ error: 'Ungültiges Gerät' });
      const limits = LIMITS.map((k) => num(d[k]));
      if (limits.some((v) => v !== null && !Number.isFinite(v))) return res.status(400).json({ error: 'Grenzwerte müssen Zahlen sein' });
      rows.push([d.id, typeof d.label === 'string' ? d.label.trim().slice(0, 50) : '', ...limits]);
    }
    db.exec('BEGIN');
    try {
      const old = new Map(sensorsOf(db, req.familyId).map((s) => [s.device_id, s.alert_state]));
      db.prepare('DELETE FROM climate_sensors WHERE family_id = ?').run(req.familyId);
      const insert = db.prepare(
        `INSERT INTO climate_sensors (family_id, device_id, label, min_temp, max_temp, min_humidity, max_humidity, position, alert_state)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      rows.forEach((r, i) => insert.run(req.familyId, ...r, i, old.get(r[0]) ?? '[]'));
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
    publish(req.familyId, 'climate');
    res.status(204).end();
  });

  return router;
}

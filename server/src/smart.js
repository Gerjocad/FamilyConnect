// Smart Home: Lampen und Steckdosen aus dem Tuya-Projekt schalten.
// Admins wählen in den Einstellungen die Geräte aus; schalten darf jedes Familienmitglied alles.
import { Router } from 'express';
import { LIGHT_CATEGORIES, PLUG_CATEGORIES, TuyaError } from './tuya.js';

const STATE_CACHE_MS = 30 * 1000;
const KINDS = ['light', 'plug'];
const validId = (id) => typeof id === 'string' && /^[\w-]{1,64}$/.test(id);

const devicesOf = (db, familyId) =>
  db.prepare('SELECT * FROM smart_devices WHERE family_id = ? ORDER BY position, device_id').all(familyId);

export const kindOf = (category) => (LIGHT_CATEGORIES.includes(category) ? 'light' : PLUG_CATEGORIES.includes(category) ? 'plug' : null);

export function smartRouter(db, { auth, member, publish, tuya }) {
  const router = Router();
  const base = '/api/families/:familyId/smart';
  // kurz merken, damit nicht jeder Seitenaufruf Tuya fragt (das Kontingent ist begrenzt)
  const cache = new Map();

  const state = async (id) => {
    const hit = cache.get(id);
    if (hit && Date.now() - hit.at < STATE_CACHE_MS) return hit.data;
    const data = await tuya.switchState(id);
    cache.set(id, { at: Date.now(), data });
    return data;
  };
  const fail = (res, err) => {
    if (!(err instanceof TuyaError)) throw err;
    res.status(502).json({ error: err.message, expired: err.expired });
  };

  // Geräte mit Zustand
  router.get(base, auth, member, async (req, res) => {
    if (!tuya.enabled) return res.json({ enabled: false, devices: [] });
    const list = devicesOf(db, req.familyId);
    const devices = await Promise.all(list.map(async (d) => {
      const info = { device_id: d.device_id, label: d.label, kind: d.kind };
      try {
        const s = await state(d.device_id);
        return { ...info, on: s.on, brightness: s.brightness, dimmable: Boolean(s.bright_code), error: null };
      } catch (err) {
        if (!(err instanceof TuyaError)) throw err;
        return { ...info, on: null, brightness: null, dimmable: false, error: err.message };
      }
    }));
    res.json({ enabled: true, devices });
  });

  // Schalten: { on } und/oder { brightness: 1–100 }
  router.post(`${base}/:deviceId`, auth, member, async (req, res) => {
    const device = db.prepare('SELECT * FROM smart_devices WHERE family_id = ? AND device_id = ?').get(req.familyId, req.params.deviceId);
    if (!device) return res.status(404).json({ error: 'Gerät nicht gefunden' });
    const { on, brightness } = req.body ?? {};
    if (on !== undefined && typeof on !== 'boolean') return res.status(400).json({ error: 'on muss true/false sein' });
    if (brightness !== undefined && (!Number.isInteger(brightness) || brightness < 1 || brightness > 100)) {
      return res.status(400).json({ error: 'Helligkeit muss zwischen 1 und 100 liegen' });
    }
    if (on === undefined && brightness === undefined) return res.status(400).json({ error: 'Nichts zu schalten' });
    try {
      await tuya.setSwitch(device.device_id, { on, brightness });
    } catch (err) {
      return fail(res, err);
    }
    // sofort den neuen Zustand zeigen (Tuya meldet ihn erst nach ein paar Sekunden)
    const hit = cache.get(device.device_id);
    if (hit) {
      hit.data = { ...hit.data, ...(on !== undefined && { on }), ...(brightness !== undefined && { brightness }) };
      hit.at = Date.now();
    }
    publish(req.familyId, 'smart');
    res.status(204).end();
  });

  // Einstellungen: Lampen und Steckdosen des Tuya-Projekts mit Auswahl (nur Admins)
  router.get(`${base}/devices`, auth, member, async (req, res) => {
    if (req.role !== 'admin') return res.status(403).json({ error: 'Nur Admins' });
    if (!tuya.enabled) return res.json({ enabled: false, devices: [] });
    try {
      const chosen = new Map(devicesOf(db, req.familyId).map((d) => [d.device_id, d]));
      const all = await tuya.devices();
      res.json({
        enabled: true,
        devices: all
          .filter((d) => kindOf(d.category) || chosen.has(d.id))
          .map((d) => {
            const c = chosen.get(d.id);
            return { id: d.id, name: d.name, online: d.online, category: d.category, selected: Boolean(c),
              label: c?.label ?? d.name, kind: c?.kind ?? kindOf(d.category) ?? 'plug' };
          }),
      });
    } catch (err) {
      fail(res, err);
    }
  });

  router.put(`${base}/devices`, auth, member, (req, res) => {
    if (req.role !== 'admin') return res.status(403).json({ error: 'Nur Admins' });
    const list = Array.isArray(req.body?.devices) ? req.body.devices : null;
    if (!list || list.length > 50) return res.status(400).json({ error: 'Ungültige Auswahl' });
    if (list.some((d) => !validId(d?.id))) return res.status(400).json({ error: 'Ungültiges Gerät' });
    db.exec('BEGIN');
    try {
      db.prepare('DELETE FROM smart_devices WHERE family_id = ?').run(req.familyId);
      const insert = db.prepare('INSERT OR IGNORE INTO smart_devices (family_id, device_id, label, kind, position) VALUES (?, ?, ?, ?, ?)');
      list.forEach((d, i) => insert.run(req.familyId, d.id, typeof d.label === 'string' ? d.label.trim().slice(0, 50) : '',
        KINDS.includes(d.kind) ? d.kind : 'plug', i));
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
    publish(req.familyId, 'smart');
    res.status(204).end();
  });

  return router;
}

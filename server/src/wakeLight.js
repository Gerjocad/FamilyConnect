// Schlaflicht / Aufsteh-Ampel (ESP32 + 8×8-Matrix): Zeiten und Helligkeit stellen Eltern in der App ein,
// das Gerät holt sich alle 20 s den Plan über GET /api/wake-light/<code> (der Code ersetzt die Anmeldung).
//
// Eine „Nacht“ gehört zum Morgen, an dem sie endet: Mond ab (Abend davor) → Sonnenaufgang → Sonne → aus.
// Ob Schultag oder freier Tag (Sa/So, Feiertag, Schulferien), entscheidet der Morgen.
import { Router } from 'express';
import { isManager } from './permissions.js';
import { localKey, localStamp } from './occurrences.js';
import { cleanCode, newCode } from './wall.js';

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const KINDS = ['school', 'free'];
const FIELDS = ['moon', 'dawn', 'sun', 'off'];
const TESTS = ['moon', 'dawn', 'sun', 'off'];
const TEST_SECONDS = 60;
const ONLINE_MS = 90 * 1000;

const minutes = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const hhmm = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, 12);

/** Prüft die Zeiten einer Tagesart: Sonnenaufgang ≤ Sonne ≤ aus, Mond abends ab 12 Uhr */
export function checkTimes(t) {
  for (const f of FIELDS) if (typeof t?.[f] !== 'string' || !TIME.test(t[f])) return `Bitte alle Uhrzeiten angeben (${f})`;
  if (minutes(t.dawn) > minutes(t.sun)) return 'Der Sonnenaufgang muss vor der Sonne beginnen';
  if (minutes(t.sun) > minutes(t.off)) return '„Licht aus“ muss nach der Sonne kommen';
  if (minutes(t.off) >= 12 * 60) return '„Licht aus“ bitte vor 12 Uhr mittags';
  if (minutes(t.moon) < 12 * 60) return 'Der Mond beginnt abends (nach 12 Uhr)';
  return null;
}

/**
 * Phase zu einem Zeitpunkt aus den Nächten von heute und morgen (Minuten seit Mitternacht).
 * → { phase: 'moon'|'dawn'|'sun'|'off', progress (0–1 im Sonnenaufgang) }
 */
export function phaseAt(today, tomorrow, min) {
  if (min < today.dawn) return { phase: 'moon', progress: 0 };
  if (min < today.sun) return { phase: 'dawn', progress: (min - today.dawn) / Math.max(1, today.sun - today.dawn) };
  if (min < today.off) return { phase: 'sun', progress: 1 };
  if (min < tomorrow.moon) return { phase: 'off', progress: 0 };
  return { phase: 'moon', progress: 0 };
}

export function wakeLightRouter(db, { auth, member, holidays, publish }) {
  const router = Router();
  const base = '/api/families/:familyId/wake-lights';
  const managers = (req, res, next) => (isManager(req.role) ? next() : res.status(403).json({ error: 'Nur Eltern' }));

  const row = (familyId, id) => db.prepare('SELECT * FROM wake_lights WHERE family_id = ? AND id = ?').get(familyId, id);

  /** Freier Tag? Sa/So immer, Feiertage und Ferien wenn eingeschaltet */
  async function freeDays(familyId, light, dates) {
    const out = new Map(dates.map((d) => [localKey(d), d.getDay() === 0 || d.getDay() === 6]));
    const family = db.prepare('SELECT state FROM families WHERE id = ?').get(familyId);
    if (!light.holidays_free || !family?.state || !holidays) return out;
    for (const year of new Set(dates.map((d) => d.getFullYear()))) {
      try {
        const h = await holidays.forYear(family.state, year);
        for (const key of out.keys()) {
          if (!key.startsWith(String(year))) continue;
          if (h.public.some((p) => p.date === key) || h.school.some((s) => s.start <= key && key <= s.end)) out.set(key, true);
        }
      } catch {
        // ohne Ferien/Feiertage weiter
      }
    }
    return out;
  }

  /** Nächte für heute und morgen: [{ date, free, moon, dawn, sun, off }] in Minuten */
  async function nights(light, now) {
    const dates = [now, addDays(now, 1)];
    const free = await freeDays(light.family_id, light, dates);
    return dates.map((d) => {
      const key = localKey(d);
      const kind = free.get(key) ? 'free' : 'school';
      return { date: key, free: free.get(key), ...Object.fromEntries(FIELDS.map((f) => [f, minutes(light[`${kind}_${f}`])])) };
    });
  }

  const testOf = (light, now = Date.now()) => (light.test && light.test_until > now ? { show: light.test, seconds: Math.ceil((light.test_until - now) / 1000) } : null);

  async function view(light, now = new Date()) {
    const [today, tomorrow] = await nights(light, now);
    const { phase } = phaseAt(today, tomorrow, now.getHours() * 60 + now.getMinutes());
    const nextSun = now.getHours() * 60 + now.getMinutes() < today.sun ? today : tomorrow;
    return {
      id: light.id,
      name: light.name,
      token: light.token,
      member_id: light.member_id,
      school: Object.fromEntries(FIELDS.map((f) => [f, light[`school_${f}`]])),
      free: Object.fromEntries(FIELDS.map((f) => [f, light[`free_${f}`]])),
      holidays_free: Boolean(light.holidays_free),
      sun_brightness: light.sun_brightness,
      moon_brightness: light.moon_brightness,
      last_seen_at: light.last_seen_at,
      online: Boolean(light.last_seen_at && Date.now() - Date.parse(`${light.last_seen_at}Z`) < ONLINE_MS),
      firmware: light.firmware,
      phase,
      next_sun: { date: nextSun.date, time: hhmm(nextSun.sun), free: nextSun.free },
      test: testOf(light),
    };
  }

  router.get(base, auth, member, managers, async (req, res) => {
    const lights = db.prepare('SELECT * FROM wake_lights WHERE family_id = ? ORDER BY id').all(req.familyId);
    res.json(await Promise.all(lights.map((l) => view(l))));
  });

  router.post(base, auth, member, managers, async (req, res) => {
    const name = typeof req.body?.name === 'string' && req.body.name.trim() ? req.body.name.trim().slice(0, 50) : 'Schlaflicht';
    const memberId = Number.isInteger(req.body?.member_id) ? req.body.member_id : null;
    if (memberId && !db.prepare('SELECT 1 FROM memberships WHERE family_id = ? AND user_id = ?').get(req.familyId, memberId)) {
      return res.status(400).json({ error: 'Unbekanntes Familienmitglied' });
    }
    const { lastInsertRowid } = db.prepare('INSERT INTO wake_lights (family_id, name, token, member_id, created_by) VALUES (?, ?, ?, ?, ?)')
      .run(req.familyId, name, newCode(), memberId, req.user.id);
    publish(req.familyId, 'wake-lights');
    res.status(201).json(await view(row(req.familyId, lastInsertRowid)));
  });

  router.patch(`${base}/:id`, auth, member, managers, async (req, res) => {
    const light = row(req.familyId, Number(req.params.id));
    if (!light) return res.status(404).json({ error: 'Schlaflicht nicht gefunden' });
    const b = req.body ?? {};
    const set = {};
    if (b.name !== undefined) {
      if (typeof b.name !== 'string' || !b.name.trim()) return res.status(400).json({ error: 'Bitte einen Namen angeben' });
      set.name = b.name.trim().slice(0, 50);
    }
    if (b.member_id !== undefined) {
      if (b.member_id !== null && !db.prepare('SELECT 1 FROM memberships WHERE family_id = ? AND user_id = ?').get(req.familyId, b.member_id)) {
        return res.status(400).json({ error: 'Unbekanntes Familienmitglied' });
      }
      set.member_id = b.member_id;
    }
    for (const kind of KINDS) {
      if (b[kind] === undefined) continue;
      const problem = checkTimes(b[kind]);
      if (problem) return res.status(400).json({ error: `${kind === 'school' ? 'Schultage' : 'Freie Tage'}: ${problem}` });
      for (const f of FIELDS) set[`${kind}_${f}`] = b[kind][f];
    }
    if (b.holidays_free !== undefined) set.holidays_free = b.holidays_free ? 1 : 0;
    for (const key of ['sun_brightness', 'moon_brightness']) {
      if (b[key] === undefined) continue;
      if (!Number.isInteger(b[key]) || b[key] < 0 || b[key] > 100) return res.status(400).json({ error: 'Helligkeit: 0 bis 100 %' });
      if (key === 'sun_brightness' && b[key] < 1) return res.status(400).json({ error: 'Die Sonne braucht mindestens 1 %' });
      set[key] = b[key];
    }
    if (Object.keys(set).length) {
      db.prepare(`UPDATE wake_lights SET ${Object.keys(set).map((k) => `${k} = ?`).join(', ')} WHERE id = ?`).run(...Object.values(set), light.id);
    }
    publish(req.familyId, 'wake-lights');
    res.json(await view(row(req.familyId, light.id)));
  });

  // Vorschau: das Licht zeigt eine Minute lang Mond, Sonnenaufgang, Sonne oder nichts (show: null beendet)
  router.post(`${base}/:id/test`, auth, member, managers, async (req, res) => {
    const light = row(req.familyId, Number(req.params.id));
    if (!light) return res.status(404).json({ error: 'Schlaflicht nicht gefunden' });
    const show = req.body?.show ?? null;
    if (show !== null && !TESTS.includes(show)) return res.status(400).json({ error: 'Unbekannte Vorschau' });
    db.prepare('UPDATE wake_lights SET test = ?, test_until = ? WHERE id = ?').run(show, show ? Date.now() + TEST_SECONDS * 1000 : null, light.id);
    res.json(await view(row(req.familyId, light.id)));
  });

  router.delete(`${base}/:id`, auth, member, managers, (req, res) => {
    const { changes } = db.prepare('DELETE FROM wake_lights WHERE family_id = ? AND id = ?').run(req.familyId, Number(req.params.id));
    publish(req.familyId, 'wake-lights');
    res.status(changes ? 204 : 404).end();
  });

  // Gerät: Plan für heute und morgen, Helligkeit (in %), Vorschau. ?v=<Firmware-Version>
  router.get('/api/wake-light/:code', async (req, res) => {
    const light = db.prepare('SELECT * FROM wake_lights WHERE token = ?').get(cleanCode(req.params.code));
    if (!light) return res.status(404).json({ error: 'Unbekanntes Schlaflicht' });
    const firmware = typeof req.query.v === 'string' ? req.query.v.slice(0, 20) : light.firmware;
    db.prepare("UPDATE wake_lights SET last_seen_at = datetime('now'), firmware = ? WHERE id = ?").run(firmware, light.id);
    const now = new Date();
    const [today, tomorrow] = await nights(light, now);
    res.json({
      now: localStamp(now),
      sec: now.getSeconds(),
      nights: [today, tomorrow].map(({ date, moon, dawn, sun, off }) => ({ date, moon, dawn, sun, off })),
      sun_brightness: light.sun_brightness,
      moon_brightness: light.moon_brightness,
      test: testOf(light),
    });
  });

  return router;
}

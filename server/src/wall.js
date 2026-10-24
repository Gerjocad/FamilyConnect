// Wanddisplay (z. B. altes Fire-Tablet): eigener Lese-Zugang per Link ohne Anmeldung.
// Der Admin legt einen Code an (am Tablet unter /wand eintippen) und kann ihn jederzeit widerrufen. Über den Link gibt es nur
// eine fertig zusammengestellte Übersicht – keine Schreibrechte, keine Kontaktdaten, keine Wünsche.
import { randomBytes } from 'node:crypto';
import { Router } from 'express';
import { serialize } from './crud.js';
import { violations } from './climate.js';
import { localKey, localStamp, occurrences } from './occurrences.js';
import { RESOURCES } from './resources.js';
import { TuyaError } from './tuya.js';

const EVENTS = RESOURCES.find((r) => r.path === 'events');
const VACATIONS = RESOURCES.find((r) => r.path === 'vacations');
const RAINY = 50;
// Code zum Eintippen am Tablet: 12 Zeichen ohne verwechselbare (0/O, 1/I) – 60 Bit Zufall
export const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const newCode = () => [...randomBytes(12)].map((b) => CODE_CHARS[b % 32]).join('');
export const cleanCode = (value) => String(value).toUpperCase().replace(/[^A-Z0-9]/g, '');

const normalize = (s) => s.toLocaleLowerCase('de').replace(/ı/g, 'i').replace(/ß/g, 'ss').normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Kurze Wetter-Hinweise wie auf der Übersicht der App */
export function weatherHints(forecast, now, todays) {
  const hints = [];
  const today = localKey(now);
  const hourOf = (t) => Number(t.slice(11, 13));
  const rainy = (h) => Boolean(h && (h.rain >= RAINY || (h.code >= 51 && h.rain >= 30)));
  const rest = forecast.hours.filter((h) => h.time.startsWith(today) && hourOf(h.time) >= now.getHours());
  if (rainy(rest[0])) {
    const dry = rest.find((h) => !rainy(h));
    hints.push(dry ? `Gerade nass – trockener ab ca. ${hourOf(dry.time)} Uhr` : 'Heute bleibt es nass – Regenjacke!');
  } else {
    const first = rest.find(rainy);
    if (first) hints.push(`Regen ab ca. ${hourOf(first.time)} Uhr – Regenjacke einpacken`);
  }
  for (const o of todays) {
    if (o.event.all_day || o.start.getTime() < now.getTime() - 3600_000) continue;
    const at = forecast.hours.find((h) => h.time.startsWith(today) && hourOf(h.time) === o.start.getHours());
    if (rainy(at)) hints.push(`„${o.event.title}“ um ${o.start.getHours()} Uhr: wahrscheinlich Regen`);
  }
  const day = forecast.days.find((d) => d.date === today);
  if (day?.min !== null && day?.min <= 0) hints.push('Frost – warm anziehen');
  else if (day?.max >= 28) hints.push('Heiß – Sonnencreme und viel trinken');
  if (now.getHours() >= 17) {
    const tomorrow = localKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));
    if (forecast.hours.some((h) => h.time.startsWith(tomorrow) && hourOf(h.time) >= 7 && hourOf(h.time) <= 8 && rainy(h))) {
      hints.push('Morgen früh Regen – Regenjacke bereitlegen');
    }
  }
  return hints.slice(0, 3);
}

export function wallRouter(db, { auth, member, hub, weather, tuya, holidays }) {
  const router = Router();
  const admin = (req, res, next) => (req.role === 'admin' ? next() : res.status(403).json({ error: 'Nur Admins' }));
  const base = '/api/families/:familyId/wall-displays';

  // --- Verwaltung (Familie & Profil) -------------------------------------------------
  router.get(base, auth, member, admin, (req, res) => {
    res.json(db.prepare('SELECT id, name, token, created_at, last_seen_at FROM wall_displays WHERE family_id = ? ORDER BY id').all(req.familyId));
  });
  router.post(base, auth, member, admin, (req, res) => {
    const name = typeof req.body?.name === 'string' && req.body.name.trim() ? req.body.name.trim().slice(0, 50) : 'Wanddisplay';
    const token = newCode();
    const { lastInsertRowid } = db.prepare('INSERT INTO wall_displays (family_id, name, token, created_by) VALUES (?, ?, ?, ?)')
      .run(req.familyId, name, token, req.user.id);
    res.status(201).json(db.prepare('SELECT id, name, token, created_at, last_seen_at FROM wall_displays WHERE id = ?').get(lastInsertRowid));
  });
  router.delete(`${base}/:id`, auth, member, admin, (req, res) => {
    const { changes } = db.prepare('DELETE FROM wall_displays WHERE family_id = ? AND id = ?').run(req.familyId, Number(req.params.id));
    res.status(changes ? 204 : 404).end();
  });

  // --- Anzeige ---------------------------------------------------------------------
  const display = (req, res, next) => {
    const row = db.prepare('SELECT * FROM wall_displays WHERE token = ?').get(cleanCode(req.params.token));
    if (!row) return res.status(404).json({ error: 'Dieser Wanddisplay-Link ist ungültig oder wurde entfernt' });
    req.display = row;
    next();
  };

  router.get('/api/wall/:token', display, async (req, res) => {
    const familyId = req.display.family_id;
    db.prepare("UPDATE wall_displays SET last_seen_at = datetime('now') WHERE id = ?").run(req.display.id);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const dayAfter = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 2);
    const family = db.prepare('SELECT name, state, weather_place, weather_lat, weather_lon FROM families WHERE id = ?').get(familyId);
    const members = db.prepare(
      'SELECT u.id, u.name, u.color, u.birthday FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.family_id = ? ORDER BY m.joined_at, u.id'
    ).all(familyId);

    // Termine heute und morgen, mit Logo
    const icons = db.prepare('SELECT keyword, image FROM event_icons WHERE family_id = ?').all(familyId)
      .map((i) => ({ key: normalize(i.keyword), image: i.image })).sort((a, b) => b.key.length - a.key.length);
    const iconFor = (title) => icons.find((i) => i.key && normalize(title).includes(i.key))?.image ?? null;
    const events = db.prepare('SELECT * FROM events WHERE family_id = ?').all(familyId).map((r) => serialize(EVENTS, r));
    const occ = events.flatMap((e) => occurrences(e, today, dayAfter))
      .sort((a, b) => Number(b.event.all_day) - Number(a.event.all_day) || a.start - b.start);
    const icon = new Map();
    const dayOf = (offset) => {
      const from = new Date(today.getFullYear(), today.getMonth(), today.getDate() + offset);
      const to = new Date(today.getFullYear(), today.getMonth(), today.getDate() + offset + 1);
      return occ.filter((o) => o.start < to && o.end > from || (o.start >= from && o.start < to)).map((o) => {
        if (!icon.has(o.event.title)) icon.set(o.event.title, iconFor(o.event.title));
        return {
          title: o.event.title,
          all_day: o.event.all_day,
          start: localStamp(o.start),
          end: localStamp(o.end),
          location: o.event.location,
          member_ids: o.event.member_ids,
          icon: icon.get(o.event.title),
        };
      });
    };

    // Besondere Tage: Geburtstage (Mitglieder + Kontakte), Urlaube, Ferien/Feiertage
    const special = (offset) => {
      const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + offset);
      const key = localKey(d);
      const md = key.slice(5);
      const out = [];
      const people = [...members, ...db.prepare('SELECT name, birthday FROM contacts WHERE family_id = ? AND birthday IS NOT NULL').all(familyId)];
      for (const p of people) {
        if (p.birthday?.slice(5) === md) out.push({ kind: 'birthday', text: `${p.name.split(' ')[0]} wird ${d.getFullYear() - Number(p.birthday.slice(0, 4))}` });
      }
      for (const v of db.prepare('SELECT * FROM vacations WHERE family_id = ? AND start_date <= ? AND end_date >= ?').all(familyId, key, key)) {
        const row = serialize(VACATIONS, v);
        out.push({ kind: 'vacation', text: row.title, member_ids: row.member_ids });
      }
      for (const l of db.prepare('SELECT title FROM loans WHERE family_id = ? AND returned = 0 AND due_date = ?').all(familyId, key)) {
        out.push({ kind: 'loan', text: `${l.title} zurückgeben` });
      }
      return { key, out };
    };
    const days = [0, 1].map((offset) => {
      const { key, out } = special(offset);
      return { date: key, events: dayOf(offset), special: out };
    });
    if (family.state) {
      try {
        const h = await holidays.forYear(family.state, today.getFullYear());
        for (const day of days) {
          const pub = h.public.find((p) => p.date === day.date);
          if (pub) day.special.unshift({ kind: 'holiday', text: pub.name });
          const school = h.school.find((s) => s.start <= day.date && day.date <= s.end);
          if (school) day.special.push({ kind: 'school', text: school.name });
        }
      } catch {
        // ohne Ferien weiter
      }
    }

    // Wetter
    let forecast = null;
    if (family.weather_lat !== null && family.weather_lon !== null) {
      try {
        const f = await weather.forecast(family.weather_lat, family.weather_lon);
        const todays = occ.filter((o) => localKey(o.start) === localKey(now));
        forecast = { place: family.weather_place, current: f.current, days: f.days, hints: weatherHints(f, now, todays) };
      } catch {
        forecast = null;
      }
    }

    // Raumklima
    let climate = [];
    if (tuya.enabled) {
      const sensors = db.prepare('SELECT * FROM climate_sensors WHERE family_id = ? ORDER BY position, device_id').all(familyId);
      climate = await Promise.all(sensors.map(async (s) => {
        try {
          const data = await tuya.climate(s.device_id);
          return { label: s.label || 'Thermometer', temperature: data.temperature, humidity: data.humidity, warnings: violations(s, data) };
        } catch (err) {
          if (!(err instanceof TuyaError)) throw err;
          return { label: s.label || 'Thermometer', temperature: null, humidity: null, warnings: [] };
        }
      }));
    }

    // Pinnwand: die letzten Beiträge
    const posts = db.prepare('SELECT text, created_by, created_at FROM posts WHERE family_id = ? ORDER BY id DESC LIMIT 3').all(familyId);

    res.json({
      family: family.name,
      now: localStamp(now),
      members: members.map(({ id, name, color }) => ({ id, name, color })),
      days,
      weather: forecast,
      climate,
      posts,
    });
  });

  // Live-Hinweis bei Änderungen (wie /api/live, aber über den Link)
  router.get('/api/wall/:token/live', display, (req, res) => {
    res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    res.flushHeaders();
    res.write(': verbunden\n\n');
    const unsubscribe = hub.subscribe(req.display.family_id, res);
    const keepAlive = setInterval(() => res.write(': ping\n\n'), 25_000);
    req.on('close', () => {
      clearInterval(keepAlive);
      unsubscribe();
    });
  });

  return router;
}

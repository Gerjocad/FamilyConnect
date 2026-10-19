import express from 'express';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  COLORS, createSession, generateInviteCode, hashPassword, hashToken, randomColor,
  requireMember, requireUser, verifyPassword,
} from './auth.js';
import { crudRouter } from './crud.js';
import { birthdaysRouter } from './birthdays.js';
import { choresRouter } from './chores.js';
import { climateRouter } from './climate.js';
import { complaintsRouter } from './complaints.js';
import { feedbackRouter } from './feedback.js';
import { habitsRouter } from './habits.js';
import { HolidayService, STATES } from './holidays.js';
import { LiveHub } from './live.js';
import { TuyaClient } from './tuya.js';
import { ROLES } from './permissions.js';
import { ensureShoppingList } from './db.js';
import { pollsRouter } from './polls.js';
import { recipesRouter } from './recipes.js';
import { requestsRouter } from './requests.js';
import { RESOURCES } from './resources.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;
// Farbschemata der App – gleiche Namen wie in client/src/themes.ts
const THEMES = ['orange', 'ocean', 'forest', 'berry', 'lavender', 'teal'];

function cleanText(value, max) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

export function createApp(db, { staticDir, push, appRelease, uploadDir, recipeImporter, holidays = new HolidayService(), tuya = new TuyaClient() } = {}) {
  const app = express();
  const hub = new LiveHub();
  const auth = requireUser(db);
  const member = requireMember(db);

  // Die Android-App läuft unter einer eigenen Herkunft (http://localhost) und ruft die API
  // daher fremd-origin auf. Die Anmeldung läuft über Bearer-Token statt Cookies, deshalb
  // ist es unbedenklich, jede Herkunft zuzulassen.
  app.use('/api', (req, res, next) => {
    res.set({
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      'Access-Control-Max-Age': '86400',
    });
    if (req.method === 'OPTIONS') return res.status(204).end();
    next();
  });

  // Feedback mit Screenshots und der Rezept-Import haben ein eigenes, größeres Limit
  const smallJson = express.json({ limit: '100kb' });
  const largeBody = /^\/api\/families\/\d+\/(feedback|complaints|recipes\/(import|search))$/;
  app.use((req, res, next) => (largeBody.test(req.path) && req.method === 'POST' ? next() : smallJson(req, res, next)));

  app.get('/api/health', (req, res) => res.json({ app: 'familyconnect', ok: true }));

  // Neueste Android-App für das Update in der App
  app.get('/api/app/latest', async (req, res) => {
    const latest = await appRelease?.latest();
    if (!latest) return res.status(404).json({ error: 'Keine App-Version veröffentlicht' });
    res.json(latest);
  });

  const familiesOf = (userId) =>
    db.prepare(
      `SELECT f.id, f.name, m.role FROM memberships m
       JOIN families f ON f.id = m.family_id WHERE m.user_id = ? ORDER BY f.name`
    ).all(userId);

  const familyDetails = (familyId) => {
    const family = db.prepare('SELECT id, name, invite_code, state, created_at FROM families WHERE id = ?').get(familyId);
    family.members = db.prepare(
      `SELECT u.id, u.name, u.color, u.birthday, m.role, m.joined_at FROM memberships m
       JOIN users u ON u.id = m.user_id WHERE m.family_id = ? ORDER BY m.joined_at, u.id`
    ).all(familyId);
    return family;
  };

  const joinFamily = (familyId, userId, role) => {
    db.prepare('INSERT OR IGNORE INTO memberships (family_id, user_id, role) VALUES (?, ?, ?)').run(familyId, userId, role);
    // Farben sollen innerhalb einer Familie unterscheidbar sein
    const taken = new Set(db.prepare(
      `SELECT u.color FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.family_id = ? AND u.id != ?`
    ).all(familyId, userId).map((r) => r.color));
    const own = db.prepare('SELECT color FROM users WHERE id = ?').get(userId).color;
    const free = COLORS.find((c) => !taken.has(c));
    if (taken.has(own) && free) db.prepare('UPDATE users SET color = ? WHERE id = ?').run(free, userId);
    hub.publish(familyId, 'family');
  };

  // --- Konto ---------------------------------------------------------------

  app.post('/api/auth/register', (req, res) => {
    const name = cleanText(req.body?.name, 100);
    const email = cleanText(req.body?.email, 200).toLowerCase();
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!name) return res.status(400).json({ error: 'Bitte gib deinen Namen an' });
    if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Bitte gib eine gültige E-Mail-Adresse an' });
    if (password.length < 8) return res.status(400).json({ error: 'Das Passwort muss mindestens 8 Zeichen haben' });
    if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email))
      return res.status(409).json({ error: 'Diese E-Mail-Adresse ist bereits registriert' });

    const { lastInsertRowid } = db
      .prepare('INSERT INTO users (name, email, password_hash, color) VALUES (?, ?, ?, ?)')
      .run(name, email, hashPassword(password), randomColor());
    const token = createSession(db, Number(lastInsertRowid));
    res.status(201).json({ token });
  });

  app.post('/api/auth/login', (req, res) => {
    const email = cleanText(req.body?.email, 200).toLowerCase();
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    const user = db.prepare('SELECT id, password_hash FROM users WHERE email = ?').get(email);
    if (!user || !verifyPassword(password, user.password_hash))
      return res.status(401).json({ error: 'E-Mail oder Passwort ist falsch' });
    res.json({ token: createSession(db, user.id) });
  });

  app.post('/api/auth/logout', auth, (req, res) => {
    db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(req.token));
    res.status(204).end();
  });

  app.get('/api/me', auth, (req, res) => {
    res.json({ ...req.user, families: familiesOf(req.user.id) });
  });

  app.patch('/api/me', auth, (req, res) => {
    const name = req.body?.name === undefined ? req.user.name : cleanText(req.body.name, 100);
    const color = req.body?.color === undefined ? req.user.color : req.body.color;
    const theme = req.body?.theme === undefined ? req.user.theme : req.body.theme;
    if (!name) return res.status(400).json({ error: 'Bitte gib deinen Namen an' });
    if (typeof color !== 'string' || !COLOR_RE.test(color)) return res.status(400).json({ error: 'Ungültige Farbe' });
    if (!THEMES.includes(theme)) return res.status(400).json({ error: 'Unbekanntes Farbschema' });
    db.prepare('UPDATE users SET name = ?, color = ?, theme = ? WHERE id = ?').run(name, color, theme, req.user.id);
    for (const f of familiesOf(req.user.id)) hub.publish(f.id, 'family');
    res.json({ ...req.user, name, color, theme, families: familiesOf(req.user.id) });
  });

  // --- Geräte für Push-Benachrichtigungen ----------------------------------

  app.post('/api/devices', auth, (req, res) => {
    const token = typeof req.body?.token === 'string' ? req.body.token.trim() : '';
    const platform = req.body?.platform === 'ios' ? 'ios' : 'android';
    if (!token || token.length > 4096) return res.status(400).json({ error: 'Ungültiges Geräte-Token' });
    // Ein Gerät gehört immer dem zuletzt angemeldeten Nutzer
    db.prepare(
      `INSERT INTO devices (token, user_id, platform) VALUES (?, ?, ?)
       ON CONFLICT(token) DO UPDATE SET user_id = excluded.user_id, platform = excluded.platform`
    ).run(token, req.user.id, platform);
    res.status(204).end();
  });

  app.post('/api/devices/unregister', auth, (req, res) => {
    const token = typeof req.body?.token === 'string' ? req.body.token : '';
    db.prepare('DELETE FROM devices WHERE token = ? AND user_id = ?').run(token, req.user.id);
    res.status(204).end();
  });

  // --- Familien ------------------------------------------------------------

  app.post('/api/families', auth, (req, res) => {
    const name = cleanText(req.body?.name, 100);
    if (!name) return res.status(400).json({ error: 'Bitte gib einen Namen für die Familie an' });
    const { lastInsertRowid } = db
      .prepare('INSERT INTO families (name, invite_code) VALUES (?, ?)')
      .run(name, generateInviteCode());
    const familyId = Number(lastInsertRowid);
    joinFamily(familyId, req.user.id, 'admin');
    ensureShoppingList(db, familyId);
    res.status(201).json(familyDetails(familyId));
  });

  app.post('/api/families/join', auth, (req, res) => {
    const code = cleanText(req.body?.code, 20).toUpperCase().replace(/[^A-Z0-9]/g, '');
    const family = db.prepare('SELECT id FROM families WHERE invite_code = ?').get(code);
    if (!family) return res.status(404).json({ error: 'Dieser Einladungscode ist ungültig' });
    // Neue Mitglieder starten als Kind; der Admin macht Erwachsene zu Eltern
    joinFamily(family.id, req.user.id, 'child');
    res.json(familyDetails(family.id));
  });

  app.get('/api/families/:familyId', auth, member, (req, res) => {
    res.json(familyDetails(req.familyId));
  });

  app.patch('/api/families/:familyId', auth, member, (req, res) => {
    if (req.role !== 'admin') return res.status(403).json({ error: 'Nur Admins dürfen die Familie bearbeiten' });
    const current = db.prepare('SELECT name, state FROM families WHERE id = ?').get(req.familyId);
    const name = req.body?.name === undefined ? current.name : cleanText(req.body.name, 100);
    const state = req.body?.state === undefined ? current.state : req.body.state || null;
    if (!name) return res.status(400).json({ error: 'Bitte gib einen Namen für die Familie an' });
    if (state !== null && !(state in STATES)) return res.status(400).json({ error: 'Unbekanntes Bundesland' });
    db.prepare('UPDATE families SET name = ?, state = ? WHERE id = ?').run(name, state, req.familyId);
    hub.publish(req.familyId, 'family');
    res.json(familyDetails(req.familyId));
  });

  app.post('/api/families/:familyId/invite-code', auth, member, (req, res) => {
    if (req.role !== 'admin') return res.status(403).json({ error: 'Nur Admins dürfen den Code erneuern' });
    db.prepare('UPDATE families SET invite_code = ? WHERE id = ?').run(generateInviteCode(), req.familyId);
    hub.publish(req.familyId, 'family');
    res.json(familyDetails(req.familyId));
  });

  /** Mitglied austragen; die Familie behält immer einen Admin und verschwindet mit dem letzten Mitglied */
  const removeMember = (familyId, userId) => {
    db.exec('BEGIN');
    try {
      db.prepare('DELETE FROM memberships WHERE family_id = ? AND user_id = ?').run(familyId, userId);
      db.prepare('UPDATE tasks SET assignee_id = NULL WHERE family_id = ? AND assignee_id = ?').run(familyId, userId);
      const remaining = db.prepare('SELECT user_id, role FROM memberships WHERE family_id = ? ORDER BY joined_at').all(familyId);
      if (remaining.length === 0) {
        db.prepare('DELETE FROM families WHERE id = ?').run(familyId);
      } else if (!remaining.some((m) => m.role === 'admin')) {
        // Bevorzugt ein Elternteil zum Admin machen
        const next = remaining.find((m) => m.role === 'parent') ?? remaining[0];
        db.prepare('UPDATE memberships SET role = ? WHERE family_id = ? AND user_id = ?').run('admin', familyId, next.user_id);
      }
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
    hub.publish(familyId, 'family');
    hub.publish(familyId, 'tasks');
  };

  app.post('/api/families/:familyId/leave', auth, member, (req, res) => {
    removeMember(req.familyId, req.user.id);
    res.status(204).end();
  });

  const membershipOf = (familyId, userId) =>
    db.prepare('SELECT role FROM memberships WHERE family_id = ? AND user_id = ?').get(familyId, userId);

  // Rolle ändern (Admin, Eltern, Kind) – nur Admins
  app.patch('/api/families/:familyId/members/:userId', auth, member, (req, res) => {
    if (req.role !== 'admin') return res.status(403).json({ error: 'Nur Admins dürfen Rollen vergeben' });
    const userId = Number(req.params.userId);
    const target = membershipOf(req.familyId, userId);
    if (!target) return res.status(404).json({ error: 'Kein Mitglied dieser Familie' });
    const role = req.body?.role;
    if (!ROLES.includes(role)) return res.status(400).json({ error: 'Ungültige Rolle' });
    const admins = db.prepare("SELECT COUNT(*) AS n FROM memberships WHERE family_id = ? AND role = 'admin'").get(req.familyId).n;
    if (target.role === 'admin' && role !== 'admin' && admins === 1)
      return res.status(400).json({ error: 'Die Familie braucht mindestens einen Admin' });
    db.prepare('UPDATE memberships SET role = ? WHERE family_id = ? AND user_id = ?').run(role, req.familyId, userId);
    hub.publish(req.familyId, 'family');
    res.json(familyDetails(req.familyId));
  });

  // Mitglied aus der Familie entfernen – nur Admins, sich selbst über „Familie verlassen“
  app.delete('/api/families/:familyId/members/:userId', auth, member, (req, res) => {
    if (req.role !== 'admin') return res.status(403).json({ error: 'Nur Admins dürfen Mitglieder entfernen' });
    const userId = Number(req.params.userId);
    if (userId === req.user.id) return res.status(400).json({ error: 'Zum Austreten bitte „Familie verlassen“ nutzen' });
    if (!membershipOf(req.familyId, userId)) return res.status(404).json({ error: 'Kein Mitglied dieser Familie' });
    removeMember(req.familyId, userId);
    res.json(familyDetails(req.familyId));
  });

  app.get('/api/families/:familyId/stream', auth, member, (req, res) => {
    res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.flushHeaders();
    res.write(': verbunden\n\n');
    const unsubscribe = hub.subscribe(req.familyId, res);
    const keepAlive = setInterval(() => res.write(': ping\n\n'), 25_000);
    req.on('close', () => {
      clearInterval(keepAlive);
      unsubscribe();
    });
  });

  app.use(habitsRouter(db, { auth, member, publish: (familyId, name) => hub.publish(familyId, name) }));
  if (recipeImporter) app.use(recipesRouter({ auth, member, importer: recipeImporter }));
  if (uploadDir) app.use(feedbackRouter(db, { auth, member, publish: (familyId, name) => hub.publish(familyId, name), uploadDir }));
  // Feiertage und Schulferien des Bundeslands der Familie
  app.get('/api/families/:familyId/holidays', auth, member, async (req, res) => {
    const { state } = db.prepare('SELECT state FROM families WHERE id = ?').get(req.familyId);
    const year = Number(req.query.year);
    if (!state) return res.json({ state: null, public: [], school: [] });
    if (!Number.isInteger(year) || year < 2000 || year > 2100) return res.status(400).json({ error: 'Ungültiges Jahr' });
    try {
      res.json({ state, ...(await holidays.forYear(state, year)) });
    } catch {
      res.status(502).json({ error: 'Ferien und Feiertage sind gerade nicht abrufbar' });
    }
  });

  app.use(climateRouter(db, { auth, member, publish: (familyId, name) => hub.publish(familyId, name), tuya }));
  app.use(birthdaysRouter(db, { auth, member, publish: (familyId, name) => hub.publish(familyId, name) }));
  app.use(pollsRouter(db, { auth, member, publish: (familyId, name) => hub.publish(familyId, name), push }));
  app.use(choresRouter(db, { auth, member, publish: (familyId, name) => hub.publish(familyId, name) }));
  app.use(requestsRouter(db, { auth, member, publish: (familyId, name) => hub.publish(familyId, name), push }));
  if (uploadDir) app.use(complaintsRouter(db, { auth, member, publish: (familyId, name) => hub.publish(familyId, name), uploadDir, push }));

  for (const resource of RESOURCES) {
    app.use(`/api/families/:familyId/${resource.path}`, auth, member,
      crudRouter(db, resource, (familyId, name) => hub.publish(familyId, name), (change) => push?.handleChange(change)));
  }

  app.use('/api', (req, res) => res.status(404).json({ error: 'Unbekannter Endpunkt' }));

  // --- Frontend ausliefern (nach "npm run build") ----------------------------

  if (staticDir && existsSync(staticDir)) {
    // Dateien unter /assets haben einen Hash im Namen und ändern sich nie; alles andere
    // (vor allem index.html) immer frisch laden, damit Updates sofort in der App ankommen
    app.use(express.static(staticDir, {
      setHeaders(res, path) {
        res.set('Cache-Control', /[\\/]assets[\\/]/.test(path) ? 'public, max-age=31536000, immutable' : 'no-cache');
      },
    }));
    app.get('/{*path}', (req, res) => {
      res.set('Cache-Control', 'no-cache');
      res.sendFile(join(staticDir, 'index.html'));
    });
  }

  app.use((err, req, res, _next) => {
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Ungültiges JSON' });
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Die Anfrage ist zu groß' });
    console.error(err);
    res.status(500).json({ error: 'Interner Fehler' });
  });

  return app;
}

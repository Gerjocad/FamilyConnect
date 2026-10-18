import express from 'express';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  COLORS, createSession, generateInviteCode, hashPassword, hashToken, randomColor,
  requireMember, requireUser, verifyPassword,
} from './auth.js';
import { crudRouter } from './crud.js';
import { habitsRouter } from './habits.js';
import { LiveHub } from './live.js';
import { RESOURCES } from './resources.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;

function cleanText(value, max) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

export function createApp(db, { staticDir, push } = {}) {
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

  app.use(express.json({ limit: '100kb' }));

  app.get('/api/health', (req, res) => res.json({ app: 'familyconnect', ok: true }));

  const familiesOf = (userId) =>
    db.prepare(
      `SELECT f.id, f.name, m.role FROM memberships m
       JOIN families f ON f.id = m.family_id WHERE m.user_id = ? ORDER BY f.name`
    ).all(userId);

  const familyDetails = (familyId) => {
    const family = db.prepare('SELECT id, name, invite_code, created_at FROM families WHERE id = ?').get(familyId);
    family.members = db.prepare(
      `SELECT u.id, u.name, u.color, m.role, m.joined_at FROM memberships m
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
    if (!name) return res.status(400).json({ error: 'Bitte gib deinen Namen an' });
    if (typeof color !== 'string' || !COLOR_RE.test(color)) return res.status(400).json({ error: 'Ungültige Farbe' });
    db.prepare('UPDATE users SET name = ?, color = ? WHERE id = ?').run(name, color, req.user.id);
    for (const f of familiesOf(req.user.id)) hub.publish(f.id, 'family');
    res.json({ ...req.user, name, color, families: familiesOf(req.user.id) });
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
    res.status(201).json(familyDetails(familyId));
  });

  app.post('/api/families/join', auth, (req, res) => {
    const code = cleanText(req.body?.code, 20).toUpperCase().replace(/[^A-Z0-9]/g, '');
    const family = db.prepare('SELECT id FROM families WHERE invite_code = ?').get(code);
    if (!family) return res.status(404).json({ error: 'Dieser Einladungscode ist ungültig' });
    joinFamily(family.id, req.user.id, 'member');
    res.json(familyDetails(family.id));
  });

  app.get('/api/families/:familyId', auth, member, (req, res) => {
    res.json(familyDetails(req.familyId));
  });

  app.patch('/api/families/:familyId', auth, member, (req, res) => {
    if (req.role !== 'admin') return res.status(403).json({ error: 'Nur Admins dürfen die Familie umbenennen' });
    const name = cleanText(req.body?.name, 100);
    if (!name) return res.status(400).json({ error: 'Bitte gib einen Namen für die Familie an' });
    db.prepare('UPDATE families SET name = ? WHERE id = ?').run(name, req.familyId);
    hub.publish(req.familyId, 'family');
    res.json(familyDetails(req.familyId));
  });

  app.post('/api/families/:familyId/invite-code', auth, member, (req, res) => {
    if (req.role !== 'admin') return res.status(403).json({ error: 'Nur Admins dürfen den Code erneuern' });
    db.prepare('UPDATE families SET invite_code = ? WHERE id = ?').run(generateInviteCode(), req.familyId);
    hub.publish(req.familyId, 'family');
    res.json(familyDetails(req.familyId));
  });

  app.post('/api/families/:familyId/leave', auth, member, (req, res) => {
    const { familyId } = req;
    const userId = req.user.id;
    db.exec('BEGIN');
    try {
      db.prepare('DELETE FROM memberships WHERE family_id = ? AND user_id = ?').run(familyId, userId);
      db.prepare('UPDATE tasks SET assignee_id = NULL WHERE family_id = ? AND assignee_id = ?').run(familyId, userId);
      const remaining = db.prepare('SELECT user_id, role FROM memberships WHERE family_id = ? ORDER BY joined_at').all(familyId);
      if (remaining.length === 0) {
        db.prepare('DELETE FROM families WHERE id = ?').run(familyId);
      } else if (!remaining.some((m) => m.role === 'admin')) {
        // Die Familie soll nie ohne Admin dastehen
        db.prepare('UPDATE memberships SET role = ? WHERE family_id = ? AND user_id = ?').run('admin', familyId, remaining[0].user_id);
      }
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
    hub.publish(familyId, 'family');
    hub.publish(familyId, 'tasks');
    res.status(204).end();
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

  for (const resource of RESOURCES) {
    app.use(`/api/families/:familyId/${resource.path}`, auth, member,
      crudRouter(db, resource, (familyId, name) => hub.publish(familyId, name), (change) => push?.handleChange(change)));
  }

  app.use('/api', (req, res) => res.status(404).json({ error: 'Unbekannter Endpunkt' }));

  // --- Frontend ausliefern (nach "npm run build") ----------------------------

  if (staticDir && existsSync(staticDir)) {
    app.use(express.static(staticDir));
    app.get('/{*path}', (req, res) => res.sendFile(join(staticDir, 'index.html')));
  }

  app.use((err, req, res, _next) => {
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Ungültiges JSON' });
    console.error(err);
    res.status(500).json({ error: 'Interner Fehler' });
  });

  return app;
}

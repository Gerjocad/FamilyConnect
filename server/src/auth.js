import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';

export const COLORS = ['#e8590c', '#1c7ed6', '#2f9e44', '#c2255c', '#7048e8', '#0c8599', '#e67700', '#5c940d'];

export function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return `${salt.toString('hex')}:${hash.toString('hex')}`;
}

export function verifyPassword(password, stored) {
  const [saltHex, hashHex] = stored.split(':');
  const expected = Buffer.from(hashHex, 'hex');
  const actual = scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length);
  return timingSafeEqual(expected, actual);
}

export function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

export function createSession(db, userId) {
  const token = randomBytes(32).toString('hex');
  db.prepare('INSERT INTO sessions (token_hash, user_id) VALUES (?, ?)').run(hashToken(token), userId);
  return token;
}

export function userForToken(db, token) {
  if (!token) return null;
  return db
    .prepare(
      `SELECT u.id, u.name, u.email, u.color, u.theme FROM sessions s
       JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?`
    )
    .get(hashToken(token)) ?? null;
}

export function randomColor() {
  return COLORS[Math.floor(Math.random() * COLORS.length)];
}

export function generateInviteCode() {
  // Ohne leicht verwechselbare Zeichen (0/O, 1/I)
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = randomBytes(8);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}

function bearerToken(req) {
  const header = req.get('authorization') ?? '';
  if (header.startsWith('Bearer ')) return header.slice(7);
  // EventSource kann keine Header setzen, daher Fallback auf Query-Parameter
  return typeof req.query.token === 'string' ? req.query.token : null;
}

export function requireUser(db) {
  return (req, res, next) => {
    const token = bearerToken(req);
    const user = userForToken(db, token);
    if (!user) return res.status(401).json({ error: 'Nicht angemeldet' });
    req.user = user;
    req.token = token;
    next();
  };
}

export function requireMember(db) {
  return (req, res, next) => {
    const familyId = Number(req.params.familyId);
    const membership = db
      .prepare('SELECT role FROM memberships WHERE family_id = ? AND user_id = ?')
      .get(familyId, req.user.id);
    if (!membership) return res.status(403).json({ error: 'Kein Mitglied dieser Familie' });
    req.familyId = familyId;
    req.role = membership.role;
    next();
  };
}

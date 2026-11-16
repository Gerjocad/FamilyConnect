// Sicherung (deploy/backup.sh): Zustand anzeigen, aus der App anstoßen (nur Admins) und Admins warnen,
// wenn die Sicherung in Google Drive nicht mehr klappt. Wie beim Server-Update legt der Dienst nur eine
// Anforderungsdatei an – familyconnect-backup.path startet daraufhin backup.sh als Root.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { Router } from 'express';

const STALE_MS = 50 * 60 * 60 * 1000;   // länger als 2 Nächte ohne erfolgreiche Sicherung

export class ServerBackup {
  #requestFile;
  #statusFile;

  constructor({ requestFile } = {}) {
    this.#requestFile = requestFile || null;
    this.#statusFile = this.#requestFile ? join(dirname(this.#requestFile), 'backup-status.json') : null;
  }

  get enabled() {
    return Boolean(this.#requestFile);
  }

  /** Letzter Lauf: { state: running|ok|failed|off, message, at, last_ok, size } oder null */
  status() {
    if (!this.#statusFile || !existsSync(this.#statusFile)) return null;
    try {
      return JSON.parse(readFileSync(this.#statusFile, 'utf8'));
    } catch {
      return null;
    }
  }

  get requested() {
    return Boolean(this.#requestFile && existsSync(this.#requestFile));
  }

  request(byName) {
    writeFileSync(this.#requestFile, `${new Date().toISOString()} ${byName}\n`);
  }

  /** Muss gewarnt werden? Nur wenn Google Drive eingerichtet ist (state ≠ off) */
  problem(now = Date.now()) {
    const s = this.status();
    if (!s || s.state === 'off' || s.state === 'running') return null;
    if (s.state === 'failed') return s.message;
    const lastOk = s.last_ok ? Date.parse(s.last_ok) : NaN;
    if (!Number.isFinite(lastOk) || now - lastOk > STALE_MS) return 'Seit über zwei Tagen keine Sicherung in Google Drive';
    return null;
  }
}

/** Einmal am Tag die Admins benachrichtigen, solange die Sicherung nicht klappt */
export function watchBackup(db, backup, push, { intervalMs = 6 * 60 * 60 * 1000 } = {}) {
  let lastDay = null;
  const check = () => {
    const problem = backup.problem();
    const day = new Date().toDateString();
    if (!problem || lastDay === day) return;
    lastDay = day;
    const admins = db.prepare("SELECT DISTINCT user_id FROM memberships WHERE role = 'admin'").all().map((r) => r.user_id);
    push?.notify(admins, { title: '⚠️ Sicherung', body: `${problem} – unter Familie & Profil → App & Server nachsehen`, path: '/einstellungen#app' });
  };
  check();
  return setInterval(check, intervalMs).unref();
}

export function backupRouter({ auth, member, backup }) {
  const router = Router();
  const base = '/api/families/:familyId/server-backup';
  const adminOnly = (req, res, next) =>
    req.role === 'admin' ? next() : res.status(403).json({ error: 'Nur Admins' });

  router.get(base, auth, member, adminOnly, (req, res) => {
    res.json({ enabled: backup.enabled, requested: backup.enabled && backup.requested, status: backup.status() });
  });

  router.post(base, auth, member, adminOnly, (req, res) => {
    if (!backup.enabled) return res.status(409).json({ error: 'Auf diesem Server ist die Sicherung aus der App nicht eingerichtet' });
    if (backup.requested || backup.status()?.state === 'running') return res.status(409).json({ error: 'Die Sicherung läuft bereits' });
    backup.request(req.user.name);
    res.status(202).json({ requested: true });
  });

  return router;
}

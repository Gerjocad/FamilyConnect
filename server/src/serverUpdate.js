// Server-Update aus der App anstoßen (nur Admins).
// Der Dienst selbst hat keine Root-Rechte: er legt nur eine Anforderungsdatei an, die
// familyconnect-update.path (systemd) bemerkt und daraufhin deploy/update.sh als Root startet.
// update.sh schreibt seinen Fortschritt nach update-status.json im selben Verzeichnis.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { Router } from 'express';

const LATEST_CACHE_MS = 10 * 60 * 1000;

/** Installierter Stand aus dem Git-Verzeichnis: { commit, date, branch, repo } oder null
 *  (gehört root, der Dienst läuft als familyconnect → safe.directory) */
export function readInstalled(appDir) {
  try {
    const git = (...args) => execFileSync('git', ['-c', 'safe.directory=*', '-C', appDir, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    const remote = git('remote', 'get-url', 'origin');
    return {
      commit: git('rev-parse', 'HEAD'),
      date: git('log', '-1', '--format=%cI'),
      branch: git('rev-parse', '--abbrev-ref', 'HEAD'),
      repo: /github\.com[/:]([^/]+\/[^/.]+)/.exec(remote)?.[1] ?? null,
    };
  } catch {
    return null;
  }
}

export class ServerUpdate {
  #requestFile;
  #statusFile;
  #installed;
  #fetch;
  #latest = null;
  #latestAt = 0;

  /**
   * @param requestFile  leer = Funktion aus (z. B. bei der Entwicklung)
   * @param installed    Ergebnis von readInstalled()
   */
  constructor({ requestFile, installed = null, fetchImpl = fetch } = {}) {
    this.#requestFile = requestFile || null;
    this.#statusFile = this.#requestFile ? join(dirname(this.#requestFile), 'update-status.json') : null;
    this.#installed = installed;
    this.#fetch = fetchImpl;
  }

  get enabled() {
    return Boolean(this.#requestFile);
  }

  get installed() {
    return this.#installed;
  }

  /** Letzter Lauf von update.sh: { state: running|done|unchanged|failed, message, at, commit } */
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

  /** Neuester Stand des Branches auf GitHub: { commit, date, message } oder null */
  async latest() {
    const info = this.#installed;
    if (!info?.repo || !info.branch) return null;
    if (Date.now() - this.#latestAt < LATEST_CACHE_MS) return this.#latest;
    try {
      const res = await this.#fetch(`https://api.github.com/repos/${info.repo}/commits/${encodeURIComponent(info.branch)}`, {
        headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'FamilyConnect' },
        signal: AbortSignal.timeout(10_000),
      });
      if (res.ok) {
        const data = await res.json();
        this.#latest = { commit: data.sha, date: data.commit?.committer?.date ?? null, message: String(data.commit?.message ?? '').split('\n')[0] };
      }
      this.#latestAt = Date.now();
    } catch {
      // GitHub nicht erreichbar → in einer Minute erneut versuchen
      this.#latestAt = Date.now() - LATEST_CACHE_MS + 60_000;
    }
    return this.#latest;
  }
}

export function serverUpdateRouter({ auth, member, updater }) {
  const router = Router();
  const base = '/api/families/:familyId/server-update';

  const adminOnly = (req, res, next) =>
    req.role === 'admin' ? next() : res.status(403).json({ error: 'Nur Admins dürfen den Server aktualisieren' });

  router.get(base, auth, member, adminOnly, async (req, res) => {
    res.json({
      enabled: updater.enabled,
      installed: updater.installed,
      latest: await updater.latest(),
      requested: updater.enabled && updater.requested,
      status: updater.status(),
    });
  });

  router.post(base, auth, member, adminOnly, (req, res) => {
    if (!updater.enabled) return res.status(409).json({ error: 'Auf diesem Server ist das Update aus der App nicht eingerichtet' });
    if (updater.requested || updater.status()?.state === 'running') return res.status(409).json({ error: 'Das Update läuft bereits' });
    updater.request(req.user.name);
    res.status(202).json({ requested: true });
  });

  return router;
}

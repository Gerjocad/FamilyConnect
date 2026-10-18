// Neueste Android-App-Version aus den GitHub-Releases (gebaut von .github/workflows/android.yml).
// Die App fragt /api/app/latest und bietet bei einer neueren Version das Update an.

const CACHE_MS = 30 * 60 * 1000;

export class AppRelease {
  #repo;
  #fetch;
  #cached = null;
  #fetchedAt = 0;

  constructor(repo, { fetchImpl = fetch } = {}) {
    this.#repo = repo;
    this.#fetch = fetchImpl;
  }

  get downloadBase() {
    return `https://github.com/${this.#repo}/releases/latest/download`;
  }

  /** { versionCode, versionName, apkUrl } oder null, wenn es (noch) kein Release gibt */
  async latest() {
    if (!this.#repo) return null;
    if (Date.now() - this.#fetchedAt < CACHE_MS) return this.#cached;
    try {
      const res = await this.#fetch(`${this.downloadBase}/version.json`, { redirect: 'follow', signal: AbortSignal.timeout(10_000) });
      if (res.ok) {
        const data = await res.json();
        if (Number.isInteger(data.versionCode) && typeof data.versionName === 'string') {
          this.#cached = { versionCode: data.versionCode, versionName: data.versionName, apkUrl: `${this.downloadBase}/FamilyConnect.apk` };
        }
      } else if (res.status === 404) {
        this.#cached = null;
      }
      this.#fetchedAt = Date.now();
    } catch (err) {
      // GitHub nicht erreichbar → letzte bekannte Version behalten und bald erneut versuchen
      console.error('App-Version konnte nicht abgefragt werden:', err.message);
      this.#fetchedAt = Date.now() - CACHE_MS + 60_000;
    }
    return this.#cached;
  }
}

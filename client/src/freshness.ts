// Bleibt die App lange im Hintergrund, läuft noch die alte Oberfläche. Beim Zurückkehren
// prüfen wir, ob der Server inzwischen eine neuere Version ausliefert, und laden dann neu.

const CHECK_INTERVAL_MS = 5 * 60 * 1000;

/** Name der Haupt-Skriptdatei (enthält einen Hash, ändert sich mit jeder neuen Version) */
function scriptName(html: string): string | null {
  return /\/assets\/index-[\w-]+\.js/.exec(html)?.[0] ?? null;
}

export function watchForNewVersion() {
  const current = scriptName(document.documentElement.innerHTML);
  if (!current) return; // Entwicklungsmodus (Vite) – nichts zu tun
  let lastCheck = Date.now();

  const check = async () => {
    if (document.visibilityState !== 'visible' || Date.now() - lastCheck < CHECK_INTERVAL_MS) return;
    lastCheck = Date.now();
    try {
      const res = await fetch('/', { cache: 'no-store' });
      const latest = scriptName(await res.text());
      // Nur neu laden, wenn gerade nichts bearbeitet wird (kein Fenster offen, kein Eingabefeld aktiv)
      const busy = document.querySelector('dialog[open]') || document.activeElement?.matches('input, textarea, select');
      if (latest && latest !== current && !busy) window.location.reload();
    } catch {
      // offline – beim nächsten Mal
    }
  };

  document.addEventListener('visibilitychange', () => void check());
  window.addEventListener('focus', () => void check());
}

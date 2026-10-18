import { existsSync } from 'node:fs';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// Push-Benachrichtigungen nur einschalten, wenn die Firebase-Konfiguration fürs Android-Projekt da ist
const pushEnabled = existsSync(new URL('./android/app/google-services.json', import.meta.url));

/** Ersatzseite, die die Android-App zeigt, wenn der Server nicht erreichbar ist */
function offlinePage(server: string | undefined): Plugin {
  return {
    name: 'familyconnect-offline-page',
    generateBundle() {
      const target = JSON.stringify(server ? `${server}/` : '/');
      this.emitFile({
        type: 'asset',
        fileName: 'offline.html',
        source: `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>FamilyConnect – keine Verbindung</title>
<style>
  :root { color-scheme: light dark; font-family: system-ui, sans-serif; }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #fff8f3; color: #2b2118; }
  @media (prefers-color-scheme: dark) { body { background: #17120e; color: #f3ebe4; } }
  main { text-align: center; padding: 24px; max-width: 360px; }
  img { width: 64px; height: 64px; }
  h1 { font-size: 1.4rem; margin: 16px 0 8px; }
  p { color: #8a7a6d; line-height: 1.4; }
  button { margin-top: 16px; font: inherit; font-weight: 600; color: #fff; background: #e8590c; border: 0; border-radius: 10px; padding: 12px 22px; }
</style>
</head>
<body>
<main>
  <img src="icon.svg" alt="" />
  <h1>Keine Verbindung</h1>
  <p>FamilyConnect ist gerade nicht erreichbar. Prüfe deine Internetverbindung.</p>
  <button onclick="location.href=${target.replace(/"/g, '&quot;')}">Erneut versuchen</button>
</main>
</body>
</html>
`,
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  return {
    plugins: [react(), offlinePage(env.VITE_DEFAULT_SERVER)],
    define: {
      'import.meta.env.VITE_PUSH_ENABLED': JSON.stringify(String(pushEnabled)),
    },
    server: {
      proxy: { '/api': 'http://localhost:3001' },
    },
  };
});

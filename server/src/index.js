import { networkInterfaces } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';
import { AppRelease } from './appRelease.js';
import { openDatabase } from './db.js';
import { loadServiceAccount, PushService } from './push.js';
import { RecipeImporter } from './recipeImport.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const port = Number(process.env.PORT ?? 3001);
// Hinter einem Reverse-Proxy (Caddy) nur lokal lauschen: HOST=127.0.0.1
const host = process.env.HOST;
const dbFile = process.env.DATABASE_FILE ?? join(root, 'data', 'familyconnect.db');

const db = openDatabase(dbFile);
const push = new PushService(db, loadServiceAccount(process.env.FIREBASE_SERVICE_ACCOUNT));
// GitHub-Repository mit den App-Releases; APP_RELEASES_REPO=off schaltet die Update-Prüfung ab
const releasesRepo = process.env.APP_RELEASES_REPO ?? 'Gerjocad/FamilyConnect';
const appRelease = new AppRelease(releasesRepo === 'off' ? null : releasesRepo);
// Hochgeladene Dateien (Screenshots im Feedback) liegen neben der Datenbank
const uploadDir = process.env.UPLOAD_DIR ?? join(dirname(dbFile), 'uploads');
// Rezept-Import per KI (optional): Schlüssel als Variable oder in einer Datei, siehe deploy/KI.md
const recipeImporter = new RecipeImporter({
  apiKey: process.env.ANTHROPIC_API_KEY,
  apiKeyFile: process.env.ANTHROPIC_API_KEY_FILE ?? '/etc/familyconnect/anthropic.key',
  model: process.env.ANTHROPIC_MODEL,
});
const app = createApp(db, { staticDir: join(root, 'client', 'dist'), push, appRelease, uploadDir, recipeImporter });

app.listen(port, host, () => {
  console.log(`FamilyConnect läuft auf http://localhost:${port}`);
  console.log(recipeImporter.aiEnabled ? '  Rezept-Import per KI: aktiv' : '  Rezept-Import per KI: aus (nur Seiten mit Rezept-Daten)');
  console.log(push.enabled ? '  Push-Benachrichtigungen: aktiv' : '  Push-Benachrichtigungen: aus (FIREBASE_SERVICE_ACCOUNT nicht gesetzt)');
  // Adressen anzeigen, die man in der Android-App eintragen kann
  for (const addrs of Object.values(networkInterfaces())) {
    for (const a of addrs ?? []) {
      if (a.family === 'IPv4' && !a.internal) console.log(`  im Heimnetz erreichbar unter http://${a.address}:${port}`);
    }
  }
});

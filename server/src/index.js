import { networkInterfaces } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';
import { openDatabase } from './db.js';
import { loadServiceAccount, PushService } from './push.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const port = Number(process.env.PORT ?? 3001);
// Hinter einem Reverse-Proxy (Caddy) nur lokal lauschen: HOST=127.0.0.1
const host = process.env.HOST;
const dbFile = process.env.DATABASE_FILE ?? join(root, 'data', 'familyconnect.db');

const db = openDatabase(dbFile);
const push = new PushService(db, loadServiceAccount(process.env.FIREBASE_SERVICE_ACCOUNT));
const app = createApp(db, { staticDir: join(root, 'client', 'dist'), push });

app.listen(port, host, () => {
  console.log(`FamilyConnect läuft auf http://localhost:${port}`);
  console.log(push.enabled ? '  Push-Benachrichtigungen: aktiv' : '  Push-Benachrichtigungen: aus (FIREBASE_SERVICE_ACCOUNT nicht gesetzt)');
  // Adressen anzeigen, die man in der Android-App eintragen kann
  for (const addrs of Object.values(networkInterfaces())) {
    for (const a of addrs ?? []) {
      if (a.family === 'IPv4' && !a.internal) console.log(`  im Heimnetz erreichbar unter http://${a.address}:${port}`);
    }
  }
});

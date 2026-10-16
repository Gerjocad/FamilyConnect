import { networkInterfaces } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';
import { openDatabase } from './db.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const port = Number(process.env.PORT ?? 3001);
const dbFile = process.env.DATABASE_FILE ?? join(root, 'data', 'familyconnect.db');

const db = openDatabase(dbFile);
const app = createApp(db, { staticDir: join(root, 'client', 'dist') });

app.listen(port, () => {
  console.log(`FamilyConnect läuft auf http://localhost:${port}`);
  // Adressen anzeigen, die man in der Android-App eintragen kann
  for (const addrs of Object.values(networkInterfaces())) {
    for (const a of addrs ?? []) {
      if (a.family === 'IPv4' && !a.internal) console.log(`  im Heimnetz erreichbar unter http://${a.address}:${port}`);
    }
  }
});

import { readFileSync } from 'node:fs';
import type { CapacitorConfig } from '@capacitor/cli';

// Dieselbe Server-Adresse wie in .env.production (VITE_DEFAULT_SERVER)
function defaultServer(): string | undefined {
  if (process.env.CAP_SERVER_URL) return process.env.CAP_SERVER_URL;
  try {
    // Die Capacitor-CLI läuft immer im Ordner client/
    const env = readFileSync('.env.production', 'utf8');
    return /^VITE_DEFAULT_SERVER=(.+)$/m.exec(env)?.[1]?.trim();
  } catch {
    return undefined;
  }
}

const serverUrl = defaultServer();

const config: CapacitorConfig = {
  appId: 'de.familyconnect.app',
  appName: 'FamilyConnect',
  webDir: 'dist',
  server: serverUrl
    ? {
        // Die Oberfläche kommt direkt vom FamilyConnect-Server: Änderungen sind nach einem
        // Server-Update sofort in der App – eine neue APK braucht es nur für native Änderungen.
        url: serverUrl,
        // Ohne Verbindung: mitgelieferte Ersatzseite mit "Erneut versuchen"
        errorPath: 'offline.html',
      }
    : { androidScheme: 'http' },
  android: {
    backgroundColor: '#fff8f3',
  },
};

export default config;

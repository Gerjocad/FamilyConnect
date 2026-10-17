import { Capacitor } from '@capacitor/core';

const TOKEN_KEY = 'familyconnect.token';
// Neuer Schlüssel: alte Einträge (z. B. die frühere PC-Adresse) werden so ignoriert
const SERVER_KEY = 'familyconnect.customServer';

/** In der Android-App gibt es keinen eigenen Webserver – die Server-Adresse wird beim Anmelden eingetragen. */
export const isNativeApp = Capacitor.isNativePlatform();

/** Beim Bauen der App festgelegte Server-Adresse (VITE_DEFAULT_SERVER in client/.env.production) */
export const DEFAULT_SERVER: string = import.meta.env.VITE_DEFAULT_SERVER ?? '';

export function getServerUrl(): string {
  if (!isNativeApp) return '';
  try {
    return localStorage.getItem(SERVER_KEY) || DEFAULT_SERVER;
  } catch {
    return DEFAULT_SERVER;
  }
}

export function normalizeServerUrl(input: string): string {
  let url = input.trim().replace(/\/+$/, '');
  if (url && !/^https?:\/\//i.test(url)) url = `http://${url}`;
  return url;
}

export function setServerUrl(url: string) {
  try {
    if (!url || url === DEFAULT_SERVER) localStorage.removeItem(SERVER_KEY);
    else localStorage.setItem(SERVER_KEY, url);
  } catch {
    // ohne Speicher muss die Adresse beim nächsten Start erneut eingegeben werden
  }
}

/** Prüft, ob unter der Adresse ein FamilyConnect-Server antwortet */
export async function checkServer(url: string): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(8000) });
  } catch {
    throw new Error('Server nicht erreichbar. Stimmt die Adresse und ist das Handy im selben Netz?');
  }
  const data = await res.json().catch(() => null);
  if (!res.ok || data?.app !== 'familyconnect') throw new Error('Unter dieser Adresse läuft kein FamilyConnect-Server');
}

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Ohne Speicher bleibt man nur bis zum Neuladen angemeldet
  }
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function api<T = unknown>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  const token = getToken();
  let res: Response;
  try {
    res = await fetch(`${getServerUrl()}/api${path}`, {
      // Ohne Zeitlimit hängt die App, wenn der Server nicht antwortet
      signal: AbortSignal.timeout(15_000),
      method: options.method ?? 'GET',
      headers: {
        ...(options.body !== undefined && { 'Content-Type': 'application/json' }),
        ...(token && { Authorization: `Bearer ${token}` }),
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch {
    throw new ApiError(0, 'Keine Verbindung zum Server');
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error ?? 'Etwas ist schiefgelaufen');
  return data as T;
}

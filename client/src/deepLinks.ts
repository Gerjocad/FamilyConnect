// Öffnet die App über familyconnect://h/<code> (NFC-Aufkleber), landet sie auf der passenden Seite.
import { App } from '@capacitor/app';
import { isNativeApp } from './api';

type Listener = (path: string) => void;
const listeners = new Set<Listener>();
let pending: string | null = null;

export function pathFromUrl(url: string): string | null {
  const match = /^familyconnect:\/\/h\/([0-9a-f]{8,64})\/?$/i.exec(url.trim());
  return match ? `/h/${match[1].toLowerCase()}` : null;
}

function deliver(url: string) {
  const path = pathFromUrl(url);
  if (!path) return;
  // Noch niemand bereit (z. B. Anmeldeseite) → merken, bis die App-Navigation steht
  if (listeners.size === 0) pending = path;
  else listeners.forEach((l) => l(path));
}

export function initDeepLinks() {
  if (!isNativeApp) return;
  void App.getLaunchUrl().then((launch) => launch?.url && deliver(launch.url)).catch(() => {});
  void App.addListener('appUrlOpen', (event) => deliver(event.url));
}

export function onDeepLink(listener: Listener) {
  listeners.add(listener);
  if (pending) {
    const path = pending;
    pending = null;
    listener(path);
  }
  return () => {
    listeners.delete(listener);
  };
}

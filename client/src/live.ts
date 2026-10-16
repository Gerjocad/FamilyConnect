import { getToken } from './api';

type Listener = (resource: string) => void;

// Eine EventSource pro Familie; Komponenten melden sich für Änderungen an.
const listeners = new Set<Listener>();
let source: EventSource | null = null;
let currentFamily: number | null = null;

export function connectLive(familyId: number | null) {
  if (familyId === currentFamily) return;
  source?.close();
  source = null;
  currentFamily = familyId;
  const token = getToken();
  if (familyId === null || !token) return;
  source = new EventSource(`/api/families/${familyId}/stream?token=${encodeURIComponent(token)}`);
  source.onmessage = (e) => {
    const { resource } = JSON.parse(e.data) as { resource: string };
    for (const l of listeners) l(resource);
  };
}

export function onLiveChange(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

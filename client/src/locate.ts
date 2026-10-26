// „📍 Wo bist du?“ (Server: server/src/locate.js)
import { useCallback, useEffect, useState } from 'react';
import { api } from './api';
import { onLiveChange } from './live';
import { useFamily } from './session';

export interface LocateRequest {
  id: number;
  from_user: number;
  to_user: number;
  status: 'pending' | 'answered' | 'declined';
  created_at: string;
  answered_at: string | null;
  lat: number | null;
  lon: number | null;
  accuracy: number | null;
  message: string | null;
  place: { id: number; name: string; icon: string } | null;
}

export const QUICK_ANSWERS = ['Bin auf dem Heimweg', 'Bei Freunden', 'In der Schule', 'Komme gleich', 'Alles gut 👍'];

export const mapsLink = (r: Pick<LocateRequest, 'lat' | 'lon'>) => `https://www.google.com/maps/search/?api=1&query=${r.lat},${r.lon}`;

/** „vor 5 Min.“ – Zeiten vom Server sind UTC (YYYY-MM-DD HH:MM:SS) */
export function ago(sql: string) {
  const minutes = Math.round((Date.now() - new Date(`${sql.replace(' ', 'T')}Z`).getTime()) / 60_000);
  if (minutes < 1) return 'gerade eben';
  if (minutes < 60) return `vor ${minutes} Min.`;
  const hours = Math.floor(minutes / 60);
  return `vor ${hours} Std.`;
}

/** Meine Abfragen der letzten 24 Stunden (gestellte und an mich) */
export function useLocateRequests() {
  const { family } = useFamily();
  const base = `/families/${family.id}/locate`;
  const [items, setItems] = useState<LocateRequest[]>([]);
  const reload = useCallback(async () => setItems(await api<LocateRequest[]>(base)), [base]);
  useEffect(() => {
    void reload().catch(() => undefined);
    return onLiveChange((resource) => resource === 'locate' && void reload().catch(() => undefined));
  }, [reload]);
  return { items, reload, base };
}

/** Einmal den aktuellen Standort holen (Handy fragt beim ersten Mal nach der Erlaubnis) */
export function currentPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('Dieses Gerät kann keinen Standort bestimmen'));
    navigator.geolocation.getCurrentPosition(resolve, (err) => {
      reject(new Error(err.code === err.PERMISSION_DENIED
        ? 'Standort ist nicht erlaubt – in den Einstellungen des Handys für FamilyConnect erlauben'
        : 'Standort konnte nicht bestimmt werden – draußen oder mit WLAN klappt es besser'));
    }, { enableHighAccuracy: true, timeout: 20_000, maximumAge: 30_000 });
  });
}

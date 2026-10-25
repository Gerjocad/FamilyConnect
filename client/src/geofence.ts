// Eigenes Android-Plugin (client/android/…/GeofencePlugin.java): Orte bei Android anmelden.
import { Capacitor, registerPlugin } from '@capacitor/core';
import { getServerUrl, getToken } from './api';
import type { Place } from './places';

export interface GeofenceState {
  /** Google-Play-Dienste vorhanden */
  available: boolean;
  /** Standort-Berechtigung („Bei Nutzung der App“) */
  foreground: boolean;
  /** „Immer erlauben“ – nötig, damit es auch bei geschlossener App klappt */
  background: boolean;
  /** Orte sind angemeldet */
  active: boolean;
}

interface GeofencePlugin {
  status(): Promise<GeofenceState>;
  requestForeground(): Promise<GeofenceState>;
  requestBackground(): Promise<GeofenceState>;
  sync(options: { server: string; token: string; familyId: number; places: Pick<Place, 'id' | 'lat' | 'lon' | 'radius'>[] }): Promise<GeofenceState & { registered: number }>;
  stop(): Promise<GeofenceState>;
}

export const Geofence = registerPlugin<GeofencePlugin>('Geofence');

/** Nur in der Android-App ab der Version mit Orten */
export const canUseGeofence = () => Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('Geofence');

// Kleinere Kreise meldet Android unzuverlässig: Im Haus springt der Standort schnell mal 50 m daneben
// und es kommt „verlassen“, obwohl man drin ist. Beim Handy gilt daher mindestens dieser Radius.
export const MIN_GEOFENCE_RADIUS = 100;

/** Orte der Familie bei Android anmelden (unveränderte Orte werden nicht neu angemeldet) */
export async function syncGeofences(familyId: number, places: Place[]) {
  const token = getToken();
  if (!token) return null;
  return Geofence.sync({
    server: getServerUrl() || location.origin,
    token,
    familyId,
    places: places.map(({ id, lat, lon, radius }) => ({ id, lat, lon, radius: Math.max(radius, MIN_GEOFENCE_RADIUS) })),
  });
}

// Orte für „angekommen / losgegangen“ (Server: server/src/places.js, Android: GeofencePlugin.java)
import { useCallback, useEffect, useState } from 'react';
import { api } from './api';
import { onLiveChange } from './live';
import { useFamily } from './session';

export interface Place { id: number; name: string; icon: string; address: string; lat: number; lon: number; radius: number }
export interface PlacePref {
  member_id: number;
  place_id: number;
  arrive: boolean;
  leave: boolean;
  weekdays_only: boolean;
  from_time: string | null;
  to_time: string | null;
}
export interface Presence { user_id: number; place_id: number; changed_at: string }
export interface PlacesData {
  places: Place[];
  sharing: number[];
  /** wer gerade an welchem Ort ist */
  presence: Presence[];
  /** wer zuletzt losgegangen und noch nirgends angekommen ist (letzte 12 Stunden) */
  away: Presence[];
  prefs: PlacePref[];
}

export const PLACE_ICONS = ['🏠', '🏫', '💼', '👵', '⚽', '🏥', '🛒', '🎵', '🏊', '📍'];
export const DEFAULT_RADIUS = 50;

export function usePlaces() {
  const { family } = useFamily();
  const base = `/families/${family.id}/places`;
  const [data, setData] = useState<PlacesData | null>(null);
  const reload = useCallback(async () => {
    try {
      setData(await api<PlacesData>(base));
    } catch {
      // offline
    }
  }, [base]);
  useEffect(() => {
    void reload();
    return onLiveChange((resource) => (resource === 'places' || resource === 'family') && void reload());
  }, [reload]);
  const call = async (path: string, init: Parameters<typeof api>[1]) => {
    const result = await api(base + path, init);
    await reload();
    return result;
  };
  return {
    data,
    base,
    reload,
    save: (place: Partial<Place>) => call(place.id ? `/${place.id}` : '', { method: place.id ? 'PATCH' : 'POST', body: place }),
    remove: (id: number) => call(`/${id}`, { method: 'DELETE' }),
    setSharing: (enabled: boolean) => call('/sharing', { method: 'PUT', body: { enabled } }),
    savePrefs: (prefs: PlacePref[]) => call('/prefs', { method: 'PUT', body: { prefs } }),
  };
}

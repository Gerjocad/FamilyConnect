import { useEffect } from 'react';
import { Geofence, canUseGeofence, syncGeofences } from '../geofence';
import { usePlaces } from '../places';
import { useFamily } from '../session';

/** Hält die bei Android angemeldeten Orte aktuell: bei jedem Start und wenn sich Orte oder das Teilen ändern */
export function GeofenceBridge() {
  const { user, family } = useFamily();
  const { data } = usePlaces();
  const sharing = Boolean(data?.sharing.includes(user.id));
  const key = data ? JSON.stringify(data.places.map((p) => [p.id, p.lat, p.lon, p.radius])) : null;

  useEffect(() => {
    if (!canUseGeofence() || !data) return;
    void (async () => {
      try {
        const state = await Geofence.status();
        if (sharing && state.foreground) await syncGeofences(family.id, data.places);
        else if (!sharing && state.active) await Geofence.stop();
      } catch {
        // z. B. keine Play-Dienste – Einstellungen zeigen den Hinweis
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sharing, key, family.id]);

  return null;
}

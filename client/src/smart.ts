// Smart Home: Tuya-Lampen und -Steckdosen (Server: server/src/smart.js)
import { useCallback, useEffect, useState } from 'react';
import { api } from './api';
import { onLiveChange } from './live';
import { useFamily } from './session';

export interface SmartDevice {
  device_id: string;
  label: string;
  kind: 'light' | 'plug';
  kids_allowed: boolean;
  on: boolean | null;
  brightness: number | null;
  dimmable: boolean;
  error: string | null;
}

export interface SmartSetupDevice {
  id: string;
  name: string;
  online: boolean;
  category: string;
  selected: boolean;
  label: string;
  kind: 'light' | 'plug';
  kids_allowed: boolean;
}

/** Geräte mit Zustand; jede Minute und bei Änderungen anderer neu laden */
export function useSmartDevices() {
  const { family } = useFamily();
  const [data, setData] = useState<{ enabled: boolean; devices: SmartDevice[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => {
    try {
      setData(await api(`/families/${family.id}/smart`));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [family.id]);
  useEffect(() => {
    void reload();
    const timer = window.setInterval(() => void reload(), 60 * 1000);
    const off = onLiveChange((resource) => resource === 'smart' && void reload());
    return () => {
      window.clearInterval(timer);
      off();
    };
  }, [reload]);
  return { data, error, reload, setData };
}

export const switchDevice = (familyId: number, id: string, body: { on?: boolean; brightness?: number }) =>
  api(`/families/${familyId}/smart/${encodeURIComponent(id)}`, { method: 'POST', body });

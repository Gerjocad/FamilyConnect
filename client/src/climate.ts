// Raumklima der Tuya-Thermometer (Server: server/src/climate.js)
import { useCallback, useEffect, useState } from 'react';
import { api } from './api';
import { onLiveChange } from './live';
import { useFamily } from './session';

export type Warning = 'min_temp' | 'max_temp' | 'min_humidity' | 'max_humidity' | 'battery';

export interface Sensor {
  device_id: string;
  label: string;
  temperature: number | null;
  humidity: number | null;
  battery: number | null;
  warnings: Warning[];
  error: string | null;
  expired?: boolean;
}

export interface TuyaDevice {
  id: string;
  name: string;
  category: string;
  online: boolean;
  selected: boolean;
  label: string;
  min_temp: number | null;
  max_temp: number | null;
  min_humidity: number | null;
  max_humidity: number | null;
}

export const WARNING_LABELS: Record<Warning, string> = {
  min_temp: 'zu kalt',
  max_temp: 'zu warm',
  min_humidity: 'zu trocken',
  max_humidity: 'lüften!',
  battery: 'Batterie fast leer',
};

/** Messwerte; alle 2 Minuten und bei geänderter Auswahl neu laden */
export function useClimate() {
  const { family } = useFamily();
  const [data, setData] = useState<{ enabled: boolean; sensors: Sensor[] }>({ enabled: false, sensors: [] });
  const reload = useCallback(async () => {
    try {
      setData(await api(`/families/${family.id}/climate`));
    } catch {
      // offline – letzte Werte bleiben stehen
    }
  }, [family.id]);
  useEffect(() => {
    void reload();
    const timer = window.setInterval(() => void reload(), 2 * 60 * 1000);
    const off = onLiveChange((resource) => resource === 'climate' && void reload());
    return () => {
      window.clearInterval(timer);
      off();
    };
  }, [reload]);
  return data;
}

export const formatNumber = (n: number) => n.toLocaleString('de-DE', { maximumFractionDigits: 1 });

// Schlaflicht / Aufsteh-Ampel (Server: server/src/wakeLight.js)
import { useCallback, useEffect, useState } from 'react';
import { api } from './api';
import { onLiveChange } from './live';
import { useFamily } from './session';

export type Phase = 'moon' | 'dawn' | 'sun' | 'off';
export interface Times { moon: string; dawn: string; sun: string; off: string }

export interface WakeLight {
  id: number;
  name: string;
  token: string;
  member_id: number | null;
  school: Times;
  free: Times;
  holidays_free: boolean;
  sun_brightness: number;
  moon_brightness: number;
  last_seen_at: string | null;
  online: boolean;
  firmware: string | null;
  phase: Phase;
  next_sun: { date: string; time: string; free: boolean };
  test: { show: Phase; seconds: number } | null;
}

export const PHASE_LABEL: Record<Phase, string> = { moon: '🌙 Mond', dawn: '🌅 Sonnenaufgang', sun: '☀️ Sonne', off: '⚫ aus' };

export function useWakeLights() {
  const { family } = useFamily();
  const base = `/families/${family.id}/wake-lights`;
  const [lights, setLights] = useState<WakeLight[] | null>(null);
  const reload = useCallback(async () => setLights(await api<WakeLight[]>(base)), [base]);
  useEffect(() => {
    void reload().catch(() => undefined);
    const timer = window.setInterval(() => void reload().catch(() => undefined), 30_000);
    const off = onLiveChange((r) => r === 'wake-lights' && void reload().catch(() => undefined));
    return () => {
      window.clearInterval(timer);
      off();
    };
  }, [reload]);
  const replace = (l: WakeLight) => setLights((all) => all?.map((x) => (x.id === l.id ? l : x)) ?? [l]);
  return {
    lights,
    reload,
    create: async (name: string, member_id: number | null) => {
      const l = await api<WakeLight>(base, { method: 'POST', body: { name, member_id } });
      setLights((all) => [...(all ?? []), l]);
      return l;
    },
    update: async (id: number, body: Partial<Omit<WakeLight, 'id'>>) => replace(await api<WakeLight>(`${base}/${id}`, { method: 'PATCH', body })),
    test: async (id: number, show: Phase | null) => replace(await api<WakeLight>(`${base}/${id}/test`, { method: 'POST', body: { show } })),
    remove: async (id: number) => {
      await api(`${base}/${id}`, { method: 'DELETE' });
      setLights((all) => all?.filter((x) => x.id !== id) ?? []);
    },
  };
}

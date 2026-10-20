// Wetter auf der Übersicht (Server: server/src/weather.js, Daten von open-meteo.com)
import { useCallback, useEffect, useState } from 'react';
import { api } from './api';
import { toDateKey, type Occurrence } from './dates';
import { onLiveChange } from './live';
import { useFamily } from './session';

export interface WeatherHour { time: string; temp: number | null; rain: number; code: number }
export interface WeatherDay { date: string; code: number; max: number | null; min: number | null; rain: number }
export interface Weather {
  place: string | null;
  current?: { temp: number | null; code: number | null };
  days?: WeatherDay[];
  hours?: WeatherHour[];
}

/** WMO-Wettercodes → Symbol und Text */
export function describeWeather(code: number | null | undefined): { icon: string; label: string } {
  if (code === null || code === undefined) return { icon: '🌡️', label: '' };
  if (code === 0) return { icon: '☀️', label: 'Sonnig' };
  if (code <= 2) return { icon: '🌤️', label: 'Leicht bewölkt' };
  if (code === 3) return { icon: '☁️', label: 'Bewölkt' };
  if (code <= 48) return { icon: '🌫️', label: 'Nebel' };
  if (code <= 57) return { icon: '🌦️', label: 'Nieselregen' };
  if (code <= 67) return { icon: '🌧️', label: 'Regen' };
  if (code <= 77) return { icon: '🌨️', label: 'Schnee' };
  if (code <= 82) return { icon: '🌦️', label: 'Regenschauer' };
  if (code <= 86) return { icon: '🌨️', label: 'Schneeschauer' };
  return { icon: '⛈️', label: 'Gewitter' };
}

const RAINY = 50;
const hourOf = (time: string) => Number(time.slice(11, 13));

/** Hinweise für den Tag: Regenbeginn, Termine im Regen, Frost/Hitze, morgen früh */
export function weatherHints(weather: Weather, now: Date, events: Occurrence[]): string[] {
  const hints: string[] = [];
  const todayKey = toDateKey(now);
  const hours = weather.hours ?? [];
  const today = hours.filter((h) => h.time.startsWith(todayKey) && hourOf(h.time) >= now.getHours());
  const rainy = (h: WeatherHour | undefined) => Boolean(h && (h.rain >= RAINY || (h.code >= 51 && h.code <= 99 && h.rain >= 30)));

  if (rainy(today[0])) {
    const dry = today.find((h) => !rainy(h));
    hints.push(dry ? `🌧️ Gerade nass – trockener ab ca. ${hourOf(dry.time)} Uhr` : '🌧️ Heute bleibt es nass – Regenjacke!');
  } else {
    const first = today.find(rainy);
    if (first) hints.push(`🌧️ Regen ab ca. ${hourOf(first.time)} Uhr – Regenjacke einpacken`);
  }

  // Termine heute, zu deren Beginn es wahrscheinlich regnet
  for (const o of events) {
    if (o.event.all_day || toDateKey(o.start) !== todayKey || o.start.getTime() < now.getTime() - 3600_000) continue;
    const at = hours.find((h) => h.time.startsWith(todayKey) && hourOf(h.time) === o.start.getHours());
    if (rainy(at)) hints.push(`☔ „${o.event.title}“ um ${o.start.getHours()} Uhr: wahrscheinlich Regen`);
    if (hints.length >= 3) break;
  }

  const day = weather.days?.find((d) => d.date === todayKey);
  if (day?.min !== null && day?.min !== undefined && day.min <= 0) hints.push('❄️ Frost – warm anziehen, Scheiben kratzen');
  else if (day?.max !== null && day?.max !== undefined && day.max >= 28) hints.push('🧴 Heiß – Sonnencreme und viel trinken');

  // Abends: Ausblick auf den Schulweg morgen
  if (now.getHours() >= 17) {
    const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const morning = hours.filter((h) => h.time.startsWith(toDateKey(tomorrow)) && hourOf(h.time) >= 7 && hourOf(h.time) <= 8);
    if (morning.some(rainy)) hints.push('🎒 Morgen früh Regen – Regenjacke bereitlegen');
  }
  return hints.slice(0, 3);
}

/** Vorhersage; alle 30 Minuten und bei geändertem Ort neu laden */
export function useWeather() {
  const { family } = useFamily();
  const [data, setData] = useState<Weather | null>(null);
  const reload = useCallback(async () => {
    try {
      setData(await api<Weather>(`/families/${family.id}/weather`));
    } catch {
      // offline oder Dienst gestört – letzte Werte bleiben stehen
    }
  }, [family.id]);
  useEffect(() => {
    void reload();
    const timer = window.setInterval(() => void reload(), 30 * 60 * 1000);
    const off = onLiveChange((resource) => resource === 'family' && void reload());
    return () => {
      window.clearInterval(timer);
      off();
    };
  }, [reload]);
  return data;
}

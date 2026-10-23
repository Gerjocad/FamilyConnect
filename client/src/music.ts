// Musik über Spotify (Server: server/src/spotify.js)
import { useCallback, useEffect, useState } from 'react';
import { api } from './api';
import { onLiveChange } from './live';
import { useFamily } from './session';

export interface SpotifyStatus {
  configured: boolean;
  connected: boolean;
  account: { name: string; premium: boolean } | null;
  /** fester Lautsprecher; null = der gerade aktive */
  device: { id: string; name: string } | null;
  redirect_uri: string;
}
export interface MusicCard { id: number; name: string; uri: string; image: string | null; emoji: string; shuffle: boolean; token: string; played_at: string | null }
export interface Player { playing: boolean; device: string | null; volume: number | null; track: { name: string; artists: string; image: string | null } | null; context: string | null }
export interface SpotifyDevice { id: string; name: string; type: string; active: boolean; volume: number | null }
export interface PlaylistHit { uri: string; name: string; image: string | null; owner: string }

/** Adresse für NFC-Aufkleber/Karten */
export const musicUrl = (card: Pick<MusicCard, 'token'>) => `familyconnect://h/m/${card.token}`;

export function useMusic() {
  const { family } = useFamily();
  const base = `/families/${family.id}`;
  const [status, setStatus] = useState<SpotifyStatus | null>(null);
  const [cards, setCards] = useState<MusicCard[]>([]);
  const reload = useCallback(async () => {
    try {
      const [s, c] = await Promise.all([api<SpotifyStatus>(`${base}/spotify`), api<MusicCard[]>(`${base}/music`)]);
      setStatus(s);
      setCards(c);
    } catch {
      // offline
    }
  }, [base]);
  useEffect(() => {
    void reload();
    // nach der Spotify-Anmeldung im Browser zurück in die App → neu laden
    const onVisible = () => document.visibilityState === 'visible' && void reload();
    document.addEventListener('visibilitychange', onVisible);
    const off = onLiveChange((resource) => resource === 'music' && void reload());
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      off();
    };
  }, [reload]);

  return {
    status,
    cards,
    reload,
    connect: async () => (await api<{ url: string }>(`${base}/spotify/connect`, { method: 'POST' })).url,
    disconnect: async () => {
      await api(`${base}/spotify`, { method: 'DELETE' });
      await reload();
    },
    devices: () => api<SpotifyDevice[]>(`${base}/spotify/devices`),
    setDevice: async (device: { id: string; name: string } | null) => {
      await api(`${base}/spotify/device`, { method: 'PUT', body: device ?? { id: null } });
      await reload();
    },
    search: (q: string) => api<PlaylistHit[]>(`${base}/spotify/search?q=${encodeURIComponent(q)}`),
    save: async (card: Partial<MusicCard>) => {
      await api(card.id ? `${base}/music/${card.id}` : `${base}/music`, { method: card.id ? 'PATCH' : 'POST', body: card });
      await reload();
    },
    remove: async (id: number) => {
      await api(`${base}/music/${id}`, { method: 'DELETE' });
      await reload();
    },
    play: (id: number) => api<{ device: string }>(`${base}/music/${id}/play`, { method: 'POST' }),
    player: () => api<Player | null>(`${base}/spotify/player`),
    control: (action: 'pause' | 'resume' | 'next' | 'previous' | 'volume', value?: number) =>
      api(`${base}/spotify/player`, { method: 'POST', body: { action, value } }),
  };
}

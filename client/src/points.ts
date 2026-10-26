// Punkte & Belohnungen (Server: server/src/points.js)
import { useCallback, useEffect, useState } from 'react';
import { api } from './api';
import { onLiveChange } from './live';
import { useFamily } from './session';

export interface PointsSettings { enabled: boolean; released: boolean; task: number; habit: number; chore: number }
export interface PointsPerson { user_id: number; collects: boolean; balance: number; reserved: number; week: number }
export interface Reward { id: number; title: string; emoji: string; cost: number }
export interface Redemption {
  id: number;
  user_id: number;
  reward_id: number | null;
  title: string;
  emoji: string;
  cost: number;
  status: 'pending' | 'approved' | 'declined' | 'cancelled';
  created_at: string;
  decided_at: string | null;
}
export interface PointsEntry { id: number; user_id: number; amount: number; reason: string; source: string; created_by: number | null; created_at: string }
export interface PointsData {
  settings: PointsSettings;
  people: PointsPerson[];
  rewards: Reward[];
  redemptions: Redemption[];
  history: PointsEntry[];
}

/** Vorschläge für den Start – die Eltern passen Punkte und Auswahl an */
export const REWARD_IDEAS: Omit<Reward, 'id'>[] = [
  { emoji: '📱', title: '30 Min. Tablet', cost: 20 },
  { emoji: '🍦', title: 'Ein Eis', cost: 30 },
  { emoji: '🌙', title: '30 Min. länger aufbleiben', cost: 40 },
  { emoji: '🎲', title: 'Spieleabend – ich wähle das Spiel', cost: 50 },
  { emoji: '🍕', title: 'Ich darf das Abendessen aussuchen', cost: 80 },
  { emoji: '🎬', title: 'Kino', cost: 200 },
];
export const BONUS_REASONS = ['Geholfen', 'Zimmer aufgeräumt', 'Super Zeugnis/Test', 'Ohne Erinnerung erledigt', 'Lieb zu den Geschwistern'];
export const MINUS_REASONS = ['Streit', 'Nicht erledigt', 'Unhöflich'];

export function usePoints() {
  const { family } = useFamily();
  const base = `/families/${family.id}/points`;
  const [data, setData] = useState<PointsData | null>(null);
  const reload = useCallback(async () => setData(await api<PointsData>(base)), [base]);
  useEffect(() => {
    void reload();
    return onLiveChange((resource) => resource === 'points' && void reload());
  }, [reload]);
  return { data, reload, base };
}

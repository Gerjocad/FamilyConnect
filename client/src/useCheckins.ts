import { useCallback, useEffect, useState } from 'react';
import { api } from './api';
import { addDays, startOfDay, toDateKey } from './dates';
import { onLiveChange } from './live';
import { useFamily } from './session';
import type { Checkin } from './types';

/** Einträge der letzten ~3 Monate (reicht für Serien und Wochenansicht) */
export function useCheckins() {
  const { family, user } = useFamily();
  const [items, setItems] = useState<Checkin[]>([]);
  const [loading, setLoading] = useState(true);
  const since = toDateKey(addDays(startOfDay(new Date()), -90));
  const base = `/families/${family.id}`;

  const reload = useCallback(async () => {
    try {
      setItems(await api<Checkin[]>(`${base}/checkins?since=${since}`));
    } catch {
      // nächster Versuch beim nächsten Live-Update
    } finally {
      setLoading(false);
    }
  }, [base, since]);

  useEffect(() => {
    void reload();
    return onLiveChange((resource) => {
      if (resource === 'checkins') void reload();
    });
  }, [reload]);

  const toggle = useCallback(
    async (habitId: number, userId: number, date: string, done: boolean) => {
      const body = { date, ...(userId !== user.id && { user_id: userId }) };
      // optimistisch anzeigen
      setItems((prev) =>
        done
          ? prev.filter((c) => !(c.habit_id === habitId && c.user_id === userId && c.date === date))
          : [{ id: -Date.now(), habit_id: habitId, user_id: userId, date, source: 'app', created_by: user.id, created_at: '' }, ...prev]
      );
      try {
        await api(`${base}/habits/${habitId}/checkins`, { method: done ? 'DELETE' : 'POST', body });
      } finally {
        void reload();
      }
    },
    [base, reload, user.id]
  );

  return { items, loading, toggle, reload };
}

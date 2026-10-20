// Kommentare an Terminen (Server: server/src/eventComments.js)
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from './api';
import { onLiveChange } from './live';
import { useFamily } from './session';

export interface EventComment {
  id: number;
  event_id: number;
  /** Tag des Termins (bei Serien das einzelne Vorkommen) */
  date: string;
  user_id: number | null;
  text: string;
  created_at: string;
}

export const commentKey = (eventId: number, date: string) => `${eventId}|${date}`;

export function useEventComments() {
  const { family } = useFamily();
  const base = `/families/${family.id}`;
  const [items, setItems] = useState<EventComment[]>([]);

  const reload = useCallback(async () => {
    try {
      setItems(await api<EventComment[]>(`${base}/event-comments`));
    } catch {
      // offline – beim nächsten Live-Update erneut
    }
  }, [base]);

  useEffect(() => {
    void reload();
    return onLiveChange((resource) => resource === 'event-comments' && void reload());
  }, [reload]);

  /** Anzahl je Termin und Tag */
  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of items) map.set(commentKey(c.event_id, c.date), (map.get(commentKey(c.event_id, c.date)) ?? 0) + 1);
    return map;
  }, [items]);

  const add = async (eventId: number, date: string, text: string) => {
    await api(`${base}/events/${eventId}/comments`, { method: 'POST', body: { date, text } });
    await reload();
  };
  const remove = async (id: number) => {
    await api(`${base}/event-comments/${id}`, { method: 'DELETE' });
    await reload();
  };

  return { items, counts, add, remove };
}

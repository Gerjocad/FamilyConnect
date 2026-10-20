// Neuigkeiten (Glocke oben): was andere geschrieben haben – Server: server/src/activity.js
import { useCallback, useEffect, useState } from 'react';
import { api } from './api';
import { onLiveChange } from './live';
import { useFamily } from './session';

export interface ActivityItem {
  key: string;
  kind: 'comment' | 'event' | 'post' | 'complaint' | 'complaint-resolved' | 'request' | 'request-answer';
  id: number;
  /** JJJJ-MM-TT HH:MM:SS (UTC, wie in SQLite) */
  at: string;
  user_id: number | null;
  subject: string;
  text: string;
  path: string;
}

const SOURCES = new Set(['events', 'event-comments', 'posts', 'complaints', 'requests']);

export function useActivity() {
  const { family } = useFamily();
  const base = `/families/${family.id}/activity`;
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [seenAt, setSeenAt] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const data = await api<{ seen_at: string | null; items: ActivityItem[] }>(base);
      setItems(data.items);
      setSeenAt(data.seen_at);
    } catch {
      // offline – beim nächsten Live-Update erneut
    }
  }, [base]);

  useEffect(() => {
    void reload();
    return onLiveChange((resource) => SOURCES.has(resource) && void reload());
  }, [reload]);

  const isNew = (item: ActivityItem) => !seenAt || item.at > seenAt;

  const markSeen = async () => {
    await api(`${base}/seen`, { method: 'POST' });
    await reload();
  };

  return { items, unread: items.filter(isNew).length, isNew, markSeen };
}

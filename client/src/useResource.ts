import { useCallback, useEffect, useState } from 'react';
import { api } from './api';
import { onLiveChange } from './live';
import { useFamily } from './session';
import type { ResourceName } from './types';

export function useResource<T extends { id: number }>(name: ResourceName) {
  const { family } = useFamily();
  const base = `/families/${family.id}/${name}`;
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setItems(await api<T[]>(base));
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [base]);

  useEffect(() => {
    setLoading(true);
    void reload();
    return onLiveChange((resource) => {
      if (resource === name) void reload();
    });
  }, [reload, name]);

  const create = useCallback(
    async (data: Partial<T>) => {
      const created = await api<T>(base, { method: 'POST', body: data });
      setItems((prev) => [...prev, created]);
      void reload();
      return created;
    },
    [base, reload]
  );

  const update = useCallback(
    async (id: number, data: Partial<T>) => {
      // Optimistisch aktualisieren, damit z. B. Abhaken sofort sichtbar ist
      setItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...data } : item)));
      try {
        return await api<T>(`${base}/${id}`, { method: 'PATCH', body: data });
      } finally {
        void reload();
      }
    },
    [base, reload]
  );

  const remove = useCallback(
    async (id: number) => {
      setItems((prev) => prev.filter((item) => item.id !== id));
      try {
        await api(`${base}/${id}`, { method: 'DELETE' });
      } finally {
        void reload();
      }
    },
    [base, reload]
  );

  return { items, loading, error, reload, create, update, remove };
}

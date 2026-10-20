// Wunschlisten (Server: server/src/wishes.js). reserved_by ist bei eigenen Wünschen immer leer.
import { useCallback, useEffect, useState } from 'react';
import { api } from './api';
import { onLiveChange } from './live';
import { useFamily } from './session';

export interface Wish {
  id: number;
  owner_id: number;
  title: string;
  link: string;
  price: string;
  notes: string;
  created_by: number | null;
  created_at: string;
  reserved_by: number | null;
  reserved_at: string | null;
}

export type WishFields = Pick<Wish, 'title' | 'link' | 'price' | 'notes'>;

export function useWishes() {
  const { family } = useFamily();
  const base = `/families/${family.id}/wishes`;
  const [items, setItems] = useState<Wish[]>([]);
  const [loaded, setLoaded] = useState(false);
  const reload = useCallback(async () => {
    try {
      setItems(await api<Wish[]>(base));
      setLoaded(true);
    } catch {
      // offline
    }
  }, [base]);
  useEffect(() => {
    void reload();
    return onLiveChange((resource) => resource === 'wishes' && void reload());
  }, [reload]);
  const call = async (path: string, init?: Parameters<typeof api>[1]) => {
    await api(base + path, init);
    await reload();
  };
  return {
    items,
    loaded,
    add: (body: WishFields & { owner_id: number }) => call('', { method: 'POST', body }),
    update: (wish: Wish, body: WishFields) => call(`/${wish.id}`, { method: 'PATCH', body }),
    remove: (wish: Wish) => call(`/${wish.id}`, { method: 'DELETE' }),
    reserve: (wish: Wish) => call(`/${wish.id}/reserve`, { method: 'POST' }),
    release: (wish: Wish) => call(`/${wish.id}/reserve`, { method: 'DELETE' }),
  };
}

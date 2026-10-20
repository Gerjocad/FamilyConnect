// Logos im Kalender: steht das Stichwort im Titel eines Termins, erscheint das Bild daneben.
import { useCallback } from 'react';
import type { EventIcon } from './types';
import { useResource } from './useResource';

/** Groß-/Kleinschreibung und Sonderzeichen egal: „Fenerbahçe“ = „fenerbahce“ */
export const normalize = (text: string) =>
  text.toLocaleLowerCase('de').replace(/ı/g, 'i').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ß/g, 'ss');

export function useEventIcons() {
  const icons = useResource<EventIcon>('event-icons');
  const iconFor = useCallback(
    (title: string) => {
      const t = normalize(title);
      // längere Stichwörter zuerst, damit „Fenerbahçe Basketbol“ vor „Fenerbahçe“ greift
      const sorted = [...icons.items].sort((a, b) => b.keyword.length - a.keyword.length);
      return sorted.find((i) => t.includes(normalize(i.keyword)))?.image ?? null;
    },
    [icons.items]
  );
  return { ...icons, iconFor };
}

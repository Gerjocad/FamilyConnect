// Logos im Kalender: steht das Stichwort im Titel eines Termins, erscheint das Bild daneben.
import { useCallback } from 'react';
import type { EventIcon } from './types';
import { useResource } from './useResource';

/** Groß-/Kleinschreibung und Sonderzeichen egal: „Fenerbahçe“ = „fenerbahce“ */
export const normalize = (text: string) =>
  text.toLocaleLowerCase('de').replace(/ı/g, 'i').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ß/g, 'ss');

/** Passt die Regel zum (normalisierten) Titel? Gleiche Logik wie iconMatches in server/src/wall.js */
export function iconMatches(icon: Pick<EventIcon, 'keyword' | 'keyword2' | 'match_any'>, title: string) {
  const words = [icon.keyword, icon.keyword2].map((w) => normalize(w ?? '').trim()).filter(Boolean);
  if (!words.length) return false;
  return icon.match_any ? words.some((w) => title.includes(w)) : words.every((w) => title.includes(w));
}

/** Genauere Regeln zuerst: „Fenerbahçe + Basketbol“ vor „Fenerbahçe“ */
const score = (i: EventIcon) => (i.match_any ? 0 : (i.keyword2 ?? '').length) + i.keyword.length;

/** Anzeige der Regel: „Fenerbahçe + Basketbol“ (beide) bzw. „Fenerbahçe oder FB“ */
export const iconLabel = (i: Pick<EventIcon, 'keyword' | 'keyword2' | 'match_any'>) =>
  i.keyword2 ? `${i.keyword} ${i.match_any ? 'oder' : '+'} ${i.keyword2}` : i.keyword;

export function useEventIcons() {
  const icons = useResource<EventIcon>('event-icons');
  const iconFor = useCallback(
    (title: string) => {
      const t = normalize(title);
      // genauere Regeln zuerst, damit „Fenerbahçe + Basketbol“ vor „Fenerbahçe“ greift
      const sorted = [...icons.items].sort((a, b) => score(b) - score(a));
      return sorted.find((i) => iconMatches(i, t))?.image ?? null;
    },
    [icons.items]
  );
  return { ...icons, iconFor };
}

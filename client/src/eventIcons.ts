// Logos im Kalender: steht das Stichwort im Titel eines Termins, erscheint das Bild daneben –
// bei „Fenerbahçe – Galatasaray“ auch beide Wappen nebeneinander.
import { useCallback } from 'react';
import type { EventIcon } from './types';
import { useResource } from './useResource';

/** Groß-/Kleinschreibung und Sonderzeichen egal: „Fenerbahçe“ = „fenerbahce“ */
export const normalize = (text: string) =>
  text.toLocaleLowerCase('de').replace(/ı/g, 'i').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ß/g, 'ss');

/**
 * Alle Logos zu einem Titel, in der Reihenfolge der Wörter im Titel. Längere Stichwörter gehen vor, wenn sie sich
 * überschneiden („Fenerbahçe Basketbol“ statt „Fenerbahçe“). Gleiche Logik wie logosFor in server/src/wall.js.
 */
export function logosFor(rules: Pick<EventIcon, 'keyword' | 'only_with' | 'image'>[], title: string, max = 3) {
  const t = normalize(title);
  const chosen: { pos: number; end: number; image: string }[] = [];
  for (const r of [...rules].sort((a, b) => b.keyword.length - a.keyword.length)) {
    const key = normalize(r.keyword).trim();
    const pos = key ? t.indexOf(key) : -1;
    if (pos < 0) continue;
    const condition = normalize(r.only_with ?? '').trim();
    if (condition && !t.includes(condition)) continue;
    const end = pos + key.length;
    if (chosen.some((c) => (pos < c.end && c.pos < end) || c.image === r.image)) continue;
    chosen.push({ pos, end, image: r.image });
  }
  return chosen.sort((a, b) => a.pos - b.pos).slice(0, max).map((c) => c.image);
}

export function useEventIcons() {
  const icons = useResource<EventIcon>('event-icons');
  const iconsFor = useCallback((title: string) => logosFor(icons.items, title), [icons.items]);
  return { ...icons, iconsFor };
}

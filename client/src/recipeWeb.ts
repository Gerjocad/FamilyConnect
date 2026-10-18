// Rezepte aus dem Netz: per Link übernehmen und in Rezeptportalen suchen
import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { api, ApiError, isNativeApp } from './api';
import type { Recipe } from './types';

export type RecipeDraft = Omit<Recipe, 'id' | 'created_by' | 'created_at'>;

export const EMPTY_RECIPE: RecipeDraft = {
  title: '', category: '', servings: null, duration: '', ingredients: '', instructions: '', notes: '', source_url: '', image_url: '',
};

export interface WebRecipe {
  url: string;
  title: string;
  image_url: string;
  duration: string;
  source: string;
  /** false: der Server konnte die Seite nicht öffnen (Chefkoch), sie wird beim Übernehmen vom Handy geladen */
  checked: boolean;
}

/** Manche Seiten (z. B. Chefkoch) sperren Server-Zugriffe – dann lädt das Handy die Seite selbst */
async function loadOnPhone(url: string, timeoutMs = 15_000): Promise<string | null> {
  if (!isNativeApp || !Capacitor.isPluginAvailable('CapacitorHttp')) return null;
  try {
    const res = await CapacitorHttp.get({ url, responseType: 'text', connectTimeout: timeoutMs, readTimeout: timeoutMs });
    return res.status >= 200 && res.status < 300 && typeof res.data === 'string' ? res.data : null;
  } catch {
    return null;
  }
}

/** Rezept-Entwurf von einer Webseite (wird noch nicht gespeichert) */
export async function importRecipe(familyId: number, url: string): Promise<RecipeDraft> {
  const path = `/families/${familyId}/recipes/import`;
  const link = url.trim();
  let draft: Partial<RecipeDraft>;
  try {
    draft = await api<RecipeDraft>(path, { method: 'POST', body: { url: link }, timeoutMs: 90_000 });
  } catch (err) {
    // Seite hat den Server abgewiesen → übers Handy versuchen
    if (!(err instanceof ApiError) || err.status !== 502) throw err;
    const html = await loadOnPhone(link);
    if (!html) throw err;
    draft = await api<RecipeDraft>(path, { method: 'POST', body: { url: link, html }, timeoutMs: 90_000 });
  }
  return { ...EMPTY_RECIPE, ...draft };
}

export async function importRecipeFromText(familyId: number, text: string): Promise<RecipeDraft> {
  const draft = await api<RecipeDraft>(`/families/${familyId}/recipes/import`, { method: 'POST', body: { text }, timeoutMs: 90_000 });
  return { ...EMPTY_RECIPE, ...draft };
}

/** Gericht in Rezeptportalen suchen; in der App kommt Chefkoch über das Handy dazu */
export async function searchRecipes(familyId: number, query: string): Promise<WebRecipe[]> {
  const chefkochHtml = await loadOnPhone(`https://www.chefkoch.de/rs/s0/${encodeURIComponent(query.trim())}/Rezepte.html`, 8_000);
  return api<WebRecipe[]>(`/families/${familyId}/recipes/search`, {
    method: 'POST',
    body: { query, ...(chefkochHtml && { chefkochHtml }) },
    timeoutMs: 60_000,
  });
}

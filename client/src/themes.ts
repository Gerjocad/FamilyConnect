// Farbschemata der App. Die Farben selbst stehen in styles.css (:root[data-theme=…]),
// hier nur Name und Vorschau. Gleiche Namen wie THEMES in server/src/app.js.
export type ThemeId = 'orange' | 'ocean' | 'forest' | 'berry' | 'lavender' | 'teal';

export const THEMES: { id: ThemeId; label: string; preview: [string, string] }[] = [
  { id: 'orange', label: 'Sonne', preview: ['#e8590c', '#ffe8d9'] },
  { id: 'ocean', label: 'Ozean', preview: ['#1c7ed6', '#dbeafc'] },
  { id: 'forest', label: 'Wald', preview: ['#2f9e44', '#d9f2dc'] },
  { id: 'berry', label: 'Beere', preview: ['#c2255c', '#fbdce8'] },
  { id: 'lavender', label: 'Lavendel', preview: ['#7048e8', '#e5dcff'] },
  { id: 'teal', label: 'Lagune', preview: ['#0c8599', '#d3f0f3'] },
];

const KEY = 'familyconnect.theme';

/** Farbschema sofort anwenden und für den nächsten Start merken (vor der Anmeldung) */
export function applyTheme(id: string | null | undefined) {
  const theme = THEMES.find((t) => t.id === id) ?? THEMES[0];
  document.documentElement.dataset.theme = theme.id;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme.preview[0]);
  try {
    localStorage.setItem(KEY, theme.id);
  } catch {
    // ohne Speicher gilt das Schema bis zum Neuladen
  }
}

export function applyStoredTheme() {
  try {
    applyTheme(localStorage.getItem(KEY));
  } catch {
    applyTheme(null);
  }
}

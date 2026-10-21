// Urlaube und Ferien als leichte Einfärbung im Kalender – überschneiden sich mehrere,
// teilt sich das Feld in Hälften, Drittel …
import type { Member, Vacation } from './types';

export const SCHOOL_HOLIDAY_COLOR = '#20c997';
/** Auswahl im Formular: Ferien-Grün meiden, damit Urlaub davon unterscheidbar bleibt */
export const VACATION_COLORS = ['#1c7ed6', '#e8590c', '#7048e8', '#c2255c', '#2f9e44', '#f59f00'];

export function vacationColor(vacation: Vacation, member: (id: number) => Member | undefined) {
  return vacation.color || member(vacation.member_ids[0])?.color || VACATION_COLORS[0];
}

export const vacationsOn = (vacations: Vacation[], date: string) =>
  vacations.filter((v) => v.start_date <= date && date <= v.end_date);

/** Hintergrund mit gleich breiten, leicht getönten Streifen je Markierung */
export function markBackground(colors: string[]): string | undefined {
  if (!colors.length) return undefined;
  // #rrggbb + Deckkraft 16 % (0x29) – funktioniert auch in Browsern ohne color-mix
  const tint = (c: string) => (/^#[0-9a-f]{6}$/i.test(c) ? `${c}29` : `color-mix(in srgb, ${c} 16%, transparent)`);
  if (colors.length === 1) return `linear-gradient(${tint(colors[0])}, ${tint(colors[0])})`;
  const step = 100 / colors.length;
  const stops = colors.map((c, i) => `${tint(c)} ${(i * step).toFixed(2)}% ${((i + 1) * step).toFixed(2)}%`);
  return `linear-gradient(to right, ${stops.join(', ')})`;
}

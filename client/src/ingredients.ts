// Zutatenzeilen wie „200 g Mehl“ oder „1 ½ EL Öl“ in Menge und Zutat zerlegen und für andere Portionen umrechnen

const FRACTIONS: Record<string, number> = { '½': 0.5, '⅓': 1 / 3, '⅔': 2 / 3, '¼': 0.25, '¾': 0.75, '⅕': 0.2, '⅛': 0.125 };

const UNITS = [
  'g', 'gr', 'gramm', 'kg', 'kilo', 'mg', 'ml', 'l', 'liter', 'cl', 'dl',
  'el', 'tl', 'msp', 'msp.', 'prise', 'prisen', 'pck', 'pck.', 'päckchen', 'pkg', 'pkg.', 'packung', 'packungen', 'pack',
  'dose', 'dosen', 'becher', 'bund', 'stück', 'stk', 'stk.', 'scheibe', 'scheiben', 'zehe', 'zehen',
  'tasse', 'tassen', 'glas', 'gläser', 'würfel', 'tropfen', 'handvoll', 'blatt', 'blätter', 'zweig', 'zweige',
  'stange', 'stangen', 'knolle', 'knollen', 'kopf', 'köpfe', 'schuss', 'spritzer', 'beutel', 'flasche', 'flaschen', 'netz',
  'cup', 'cups', 'tbsp', 'tsp', 'oz', 'lb', 'lbs', 'pinch',
];
const UNIT_RE = UNITS.map((u) => u.replace('.', '\\.')).sort((a, b) => b.length - a.length).join('|');
const NUMBER = '\\d+(?:[.,]\\d+)?(?:\\s*\\/\\s*\\d+)?|[½⅓⅔¼¾⅕⅛]';
const AMOUNT = `(?:\\d+\\s+[½⅓⅔¼¾⅕⅛]|\\d+\\s+\\d+\\/\\d+|${NUMBER})`;
const LINE_RE = new RegExp(`^(${AMOUNT})(?:\\s*[-–]\\s*(${AMOUNT}))?\\s*(?:(${UNIT_RE})(?=[\\s.,]|$)\\.?)?\\s*(.*)$`, 'iu');

export interface Ingredient {
  /** ganze Zeile, wie sie im Rezept steht */
  line: string;
  amount: number | null;
  amountMax: number | null;
  unit: string;
  name: string;
  /** Zwischenüberschrift wie „Für den Teig:“ */
  heading: boolean;
}

function parseAmount(text: string): number {
  const t = text.trim();
  const mixed = /^(\d+)\s+(.+)$/.exec(t);
  if (mixed) return Number(mixed[1]) + parseAmount(mixed[2]);
  if (t in FRACTIONS) return FRACTIONS[t];
  const frac = /^(\d+)\s*\/\s*(\d+)$/.exec(t);
  if (frac) return Number(frac[1]) / Number(frac[2]);
  return Number(t.replace(',', '.'));
}

export function parseIngredient(raw: string): Ingredient {
  const line = raw.trim();
  if (/:$/.test(line)) return { line, amount: null, amountMax: null, unit: '', name: line.slice(0, -1), heading: true };
  const m = LINE_RE.exec(line);
  if (!m || !m[4]) return { line, amount: null, amountMax: null, unit: '', name: line, heading: false };
  const amount = parseAmount(m[1]);
  return {
    line,
    amount: Number.isFinite(amount) ? amount : null,
    amountMax: m[2] ? parseAmount(m[2]) : null,
    unit: m[3] ?? '',
    name: m[4].trim(),
    heading: false,
  };
}

export function parseIngredients(text: string): Ingredient[] {
  return text.split('\n').map((l) => l.trim()).filter(Boolean).map(parseIngredient);
}

/** 1.5 → „1,5“, 0.5 → „½“, 0.333 → „⅓“ */
export function formatAmount(value: number): string {
  const whole = Math.floor(value);
  const rest = value - whole;
  // Kleine Mengen gern als Bruch, wie man es im Rezept schreiben würde
  if (value < 10) {
    for (const [symbol, frac] of Object.entries(FRACTIONS)) {
      if (Math.abs(rest - frac) < 0.02) return whole ? `${whole} ${symbol}` : symbol;
    }
  }
  if (Math.abs(rest) < 0.02 || Math.abs(rest - 1) < 0.02) return String(Math.round(value));
  const rounded = value >= 100 ? Math.round(value / 5) * 5 : value >= 10 ? Math.round(value) : Math.round(value * 10) / 10;
  return String(rounded).replace('.', ',');
}

/** Menge (ggf. umgerechnet) für die Anzeige und die Einkaufsliste, z. B. „300 g“ */
export function quantityOf(ingredient: Ingredient, factor = 1): string {
  if (ingredient.amount === null) return '';
  const amount = formatAmount(ingredient.amount * factor);
  const max = ingredient.amountMax !== null ? `–${formatAmount(ingredient.amountMax * factor)}` : '';
  return `${amount}${max}${ingredient.unit ? ` ${ingredient.unit}` : ''}`;
}

/** Für den Abgleich mit der Einkaufsliste: „Zwiebel(n), gewürfelt“ → „zwiebel“ */
export function ingredientKey(name: string): string {
  return name.toLowerCase().split(/[,(]/)[0].replace(/\s+/g, ' ').trim();
}

// Schiffe versenken – gleiche Regeln wie server/src/battleship.js
export const SIZE = 10;
// 1× Schlachtschiff (5), 1× Kreuzer (4), 2× Zerstörer (3), 1× U-Boot (2)
export const FLEET = [5, 4, 3, 3, 2];
export const SHIP_NAMES: Record<number, string> = { 5: 'Schlachtschiff', 4: 'Kreuzer', 3: 'Zerstörer', 2: 'U-Boot' };

export interface Ship { row: number; col: number; len: number; vertical: boolean }
/** Schuss: [Zeile, Spalte, getroffen 0/1] */
export type Shot = [number, number, number];

export const cellsOf = (s: Ship): [number, number][] =>
  Array.from({ length: s.len }, (_, i) => (s.vertical ? [s.row + i, s.col] : [s.row, s.col + i]));
const key = (r: number, c: number) => `${r},${c}`;

function fits(ships: Ship[]) {
  const taken = new Map<string, number>();
  for (const [i, s] of ships.entries()) {
    for (const [r, c] of cellsOf(s)) {
      if (r < 0 || r >= SIZE || c < 0 || c >= SIZE) return false;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const other = taken.get(key(r + dr, c + dc));
          if (other !== undefined && other !== i) return false;
        }
      }
    }
    for (const [r, c] of cellsOf(s)) taken.set(key(r, c), i);
  }
  return true;
}

/** Zufällige Flotte – Schiffe berühren sich nicht (auch nicht schräg) */
export function randomFleet(): Ship[] {
  for (;;) {
    const ships: Ship[] = [];
    for (const len of FLEET) {
      for (let tries = 0; tries < 200; tries++) {
        const vertical = Math.random() < 0.5;
        const ship = { len, vertical, row: Math.floor(Math.random() * (vertical ? SIZE - len + 1 : SIZE)), col: Math.floor(Math.random() * (vertical ? SIZE : SIZE - len + 1)) };
        if (fits([...ships, ship])) {
          ships.push(ship);
          break;
        }
      }
    }
    if (ships.length === FLEET.length) return ships;
  }
}

export const shipAt = (ships: Ship[], r: number, c: number) => ships.find((s) => cellsOf(s).some(([sr, sc]) => sr === r && sc === c));
export const isSunk = (s: Ship, shots: readonly (readonly number[])[]) =>
  cellsOf(s).every(([r, c]) => shots.some((x) => x[0] === r && x[1] === c));

/** Schuss auswerten (für das Spiel gegen den Computer) */
export function fire(ships: Ship[], shots: Shot[], r: number, c: number) {
  const ship = shipAt(ships, r, c);
  const next: Shot[] = [...shots, [r, c, ship ? 1 : 0]];
  return { shots: next, hit: Boolean(ship), sunk: ship && isSunk(ship, next) ? ship : null, allSunk: ships.every((s) => isSunk(s, next)) };
}

/**
 * Computer: sucht im Schachbrettmuster; nach einem Treffer probiert er die Nachbarfelder und folgt der Linie.
 * Felder rund um versenkte Schiffe lässt er aus (Schiffe berühren sich nie).
 */
export function computerShot(shots: Shot[], sunkShips: Ship[]): [number, number] {
  const shot = new Set(shots.map(([r, c]) => key(r, c)));
  const blocked = new Set<string>();
  for (const s of sunkShips) for (const [r, c] of cellsOf(s)) for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) blocked.add(key(r + dr, c + dc));
  const free = (r: number, c: number) => r >= 0 && r < SIZE && c >= 0 && c < SIZE && !shot.has(key(r, c)) && !blocked.has(key(r, c));
  // offene Treffer = getroffen, aber noch nicht versenkt
  const open = shots.filter(([r, c, h]) => h && !blocked.has(key(r, c)));
  if (open.length) {
    const candidates: [number, number][] = [];
    if (open.length >= 2) {
      const sameRow = open.every(([r]) => r === open[0][0]);
      const sameCol = open.every(([, c]) => c === open[0][1]);
      if (sameRow) {
        const cols = open.map(([, c]) => c);
        candidates.push([open[0][0], Math.min(...cols) - 1], [open[0][0], Math.max(...cols) + 1]);
      } else if (sameCol) {
        const rows = open.map(([r]) => r);
        candidates.push([Math.min(...rows) - 1, open[0][1]], [Math.max(...rows) + 1, open[0][1]]);
      }
    }
    for (const [r, c] of open) candidates.push([r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]);
    const ok = candidates.filter(([r, c]) => free(r, c));
    if (ok.length) return ok[0];
  }
  const all: [number, number][] = [];
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) if (free(r, c)) all.push([r, c]);
  const parity = all.filter(([r, c]) => (r + c) % 2 === 0);
  const pool = parity.length ? parity : all;
  return pool[Math.floor(Math.random() * pool.length)];
}

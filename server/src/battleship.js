// Schiffe versenken: Regeln für Online-Partien. Die Schiffe des Gegners kennt nur der Server –
// jedes Handy sieht nur die eigenen Schiffe und die eigenen Schüsse (versenkte Schiffe werden aufgedeckt).
// Gleiche Regeln im Client: client/src/battleship.ts
export const SIZE = 10;
// 1× Schlachtschiff (5), 1× Kreuzer (4), 2× Zerstörer (3), 1× U-Boot (2)
export const FLEET = [5, 4, 3, 3, 2];

/** Felder eines Schiffs { row, col, len, vertical } */
export const cellsOf = (s) => Array.from({ length: s.len }, (_, i) => (s.vertical ? [s.row + i, s.col] : [s.row, s.col + i]));

/** Flotte prüfen: richtige Schiffe, auf dem Brett, ohne Überlappung und ohne sich zu berühren (auch nicht schräg) */
export function validateFleet(ships) {
  if (!Array.isArray(ships) || ships.length !== FLEET.length) return 'Falsche Anzahl Schiffe';
  const lens = ships.map((s) => s?.len).sort((a, b) => b - a);
  if (lens.join() !== [...FLEET].sort((a, b) => b - a).join()) return 'Falsche Schiffe';
  const taken = new Map();
  for (const [i, s] of ships.entries()) {
    if (!Number.isInteger(s.row) || !Number.isInteger(s.col) || typeof s.vertical !== 'boolean') return 'Ungültiges Schiff';
    for (const [r, c] of cellsOf(s)) {
      if (r < 0 || r >= SIZE || c < 0 || c >= SIZE) return 'Ein Schiff ragt über den Rand';
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const other = taken.get(`${r + dr},${c + dc}`);
          if (other !== undefined && other !== i) return 'Schiffe dürfen sich nicht berühren';
        }
      }
    }
    for (const [r, c] of cellsOf(s)) taken.set(`${r},${c}`, i);
  }
  return null;
}

/** Zufällige gültige Flotte */
export function randomFleet(random = Math.random) {
  for (;;) {
    const ships = [];
    let ok = true;
    for (const len of FLEET) {
      let placed = false;
      for (let tries = 0; tries < 200 && !placed; tries++) {
        const vertical = random() < 0.5;
        const ship = {
          len,
          vertical,
          row: Math.floor(random() * (vertical ? SIZE - len + 1 : SIZE)),
          col: Math.floor(random() * (vertical ? SIZE : SIZE - len + 1)),
        };
        if (!validateFleetPartial([...ships, ship])) {
          ships.push(ship);
          placed = true;
        }
      }
      if (!placed) ok = false;
    }
    if (ok) return ships;
  }
}
// wie validateFleet, aber für eine unvollständige Flotte (beim Verteilen)
function validateFleetPartial(ships) {
  const taken = new Map();
  for (const [i, s] of ships.entries()) {
    for (const [r, c] of cellsOf(s)) {
      if (r < 0 || r >= SIZE || c < 0 || c >= SIZE) return 'Rand';
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const other = taken.get(`${r + dr},${c + dc}`);
          if (other !== undefined && other !== i) return 'Berührt';
        }
      }
    }
    for (const [r, c] of cellsOf(s)) taken.set(`${r},${c}`, i);
  }
  return null;
}

/**
 * Schuss auf die Flotte. shots = bisherige Schüsse [[r, c], …].
 * Ergebnis: { error } | { hit, sunk (Schiff oder null), allSunk }
 */
export function shoot(ships, shots, row, col) {
  if (!Number.isInteger(row) || !Number.isInteger(col) || row < 0 || row >= SIZE || col < 0 || col >= SIZE) return { error: 'Ungültiges Feld' };
  if (shots.some(([r, c]) => r === row && c === col)) return { error: 'Da hast du schon hingeschossen' };
  const after = [...shots, [row, col]];
  const hitShip = ships.find((s) => cellsOf(s).some(([r, c]) => r === row && c === col));
  const isSunk = (s) => cellsOf(s).every(([r, c]) => after.some(([sr, sc]) => sr === r && sc === c));
  return {
    hit: Boolean(hitShip),
    sunk: hitShip && isSunk(hitShip) ? hitShip : null,
    allSunk: ships.every(isSunk),
  };
}

/** Was ein Spieler sehen darf: eigene Schiffe, eigene Schüsse mit Ergebnis, versenkte Gegnerschiffe */
export function viewFor(state, me, finished) {
  const other = me === 1 ? 2 : 1;
  const theirShips = state.ships[other] ?? [];
  const mark = (shots, ships) => shots.map(([r, c]) => [r, c, ships.some((s) => cellsOf(s).some(([sr, sc]) => sr === r && sc === c)) ? 1 : 0]);
  const sunk = (ships, shots) => ships.filter((s) => cellsOf(s).every(([r, c]) => shots.some(([sr, sc]) => sr === r && sc === c)));
  return {
    myShips: state.ships[me] ?? [],
    ready: { 1: Boolean(state.ships[1]), 2: Boolean(state.ships[2]) },
    // meine Schüsse auf den Gegner und seine auf mich: [row, col, getroffen 0/1]
    myShots: mark(state.shots[me] ?? [], theirShips),
    theirShots: mark(state.shots[other] ?? [], state.ships[me] ?? []),
    // aufgedeckt: versenkte Gegnerschiffe – am Ende alle
    revealed: finished ? theirShips : sunk(theirShips, state.shots[me] ?? []),
  };
}

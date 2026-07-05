/**
 * Grid primitives and facing math. Pure and allocation-light — the whole
 * movement/geometry layer builds on these.
 *
 * Directions are a 0..3 union (not a const enum, which isolatedModules
 * disallows) laid out clockwise so `+1 mod 4` is a right turn:
 *   0 = North, 1 = East, 2 = South, 3 = West.
 * +y is South (screen-down), matching the row-major map layout.
 */

export type Dir = 0 | 1 | 2 | 3;
export const Dir = { N: 0, E: 1, S: 2, W: 3 } as const;

export interface Vec2 {
  x: number;
  y: number;
}

const DELTAS: readonly Readonly<Vec2>[] = [
  Object.freeze({ x: 0, y: -1 }), // N
  Object.freeze({ x: 1, y: 0 }), // E
  Object.freeze({ x: 0, y: 1 }), // S
  Object.freeze({ x: -1, y: 0 }), // W
];

export const DIR_NAME: Record<Dir, string> = {
  0: 'north',
  1: 'east',
  2: 'south',
  3: 'west',
};

/** Unit step vector for a direction. Shared frozen instance — do not mutate. */
export function delta(dir: Dir): Readonly<Vec2> {
  return DELTAS[dir]!;
}

export function turnRight(dir: Dir): Dir {
  return ((dir + 1) % 4) as Dir;
}

export function turnLeft(dir: Dir): Dir {
  return ((dir + 3) % 4) as Dir;
}

export function opposite(dir: Dir): Dir {
  return ((dir + 2) % 4) as Dir;
}

/** New position one cell from `pos` in `dir`. Does not consult the map. */
export function translate(pos: Vec2, dir: Dir): Vec2 {
  const d = DELTAS[dir]!;
  return { x: pos.x + d.x, y: pos.y + d.y };
}

export function vecEquals(a: Vec2, b: Vec2): boolean {
  return a.x === b.x && a.y === b.y;
}

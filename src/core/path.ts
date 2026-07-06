/**
 * Grid pathing for monster AI (plan M6). Breadth-first search that respects
 * walls and closed doors (via canEnter) and a caller-supplied `blocked`
 * predicate for cells occupied by other monsters or the party. Bounded by a
 * search radius so far-off monsters stay cheap.
 */

import { type Dir, type Vec2, translate } from './grid';
import { type Level, canEnter } from './dungeon';

export type Blocked = (x: number, y: number) => boolean;

const DIRS: Dir[] = [0, 1, 2, 3];

function key(x: number, y: number): string {
  return `${x},${y}`;
}

export function manhattan(a: Vec2, b: Vec2): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

export function isAdjacent(a: Vec2, b: Vec2): boolean {
  return manhattan(a, b) === 1;
}

/**
 * First step of a shortest path from `from` to a free cell orthogonally
 * adjacent to `to` (the monster stops next to its quarry, not on it).
 * Returns null if no route within `radius`.
 */
export function stepToward(
  level: Level,
  from: Vec2,
  to: Vec2,
  blocked: Blocked,
  radius = 14,
): Dir | null {
  if (isAdjacent(from, to)) return null; // already in range; caller attacks
  const visited = new Set<string>([key(from.x, from.y)]);
  let frontier: { pos: Vec2; first: Dir }[] = [];

  for (const d of DIRS) {
    if (!canEnter(level, from, d)) continue;
    const n = translate(from, d);
    if (blocked(n.x, n.y)) continue;
    if (isAdjacent(n, to)) return d;
    visited.add(key(n.x, n.y));
    frontier.push({ pos: n, first: d });
  }

  for (let depth = 1; depth < radius && frontier.length > 0; depth++) {
    const next: { pos: Vec2; first: Dir }[] = [];
    for (const node of frontier) {
      for (const d of DIRS) {
        if (!canEnter(level, node.pos, d)) continue;
        const n = translate(node.pos, d);
        const k = key(n.x, n.y);
        if (visited.has(k) || blocked(n.x, n.y)) continue;
        if (isAdjacent(n, to)) return node.first;
        visited.add(k);
        next.push({ pos: n, first: node.first });
      }
    }
    frontier = next;
  }
  return null;
}

/** Direction to the reachable neighbour farthest from `threat`, or null. */
export function stepAway(level: Level, from: Vec2, threat: Vec2, blocked: Blocked): Dir | null {
  let best: Dir | null = null;
  let bestDist = manhattan(from, threat);
  for (const d of DIRS) {
    if (!canEnter(level, from, d)) continue;
    const n = translate(from, d);
    if (blocked(n.x, n.y)) continue;
    const dist = manhattan(n, threat);
    if (dist > bestDist) {
      bestDist = dist;
      best = d;
    }
  }
  return best;
}

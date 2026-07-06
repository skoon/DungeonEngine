/**
 * Scene builder — the pure, headless heart of the first-person renderer.
 *
 * Given the map and the party pose, it works out which frustum cells are
 * visible and which of their edges carry a wall, producing a back-to-front
 * draw list. No canvas, no screen coordinates — just grid logic, so it is
 * fully unit-testable (which is how we de-risk the renderer, plan M3/§9).
 * viewGeometry.ts turns each slot into screen polygons; viewport.ts paints.
 *
 * Frustum shape (plan §4.1), lateral half-width per forward row:
 *   row 0,1 -> +/-1   row 2 -> +/-2   row 3 -> +/-3
 * The party stands in row 0, lateral 0, facing "forward".
 */

import {
  type Dir,
  type Vec2,
  delta,
  translate,
  turnLeft,
  turnRight,
} from '../core/grid';
import { type Level, edgeRendersSolid, isWalkable } from '../core/dungeon';

export const ROWS = 4;
const MAX_LAT = [1, 1, 2, 3] as const;

export function maxLat(row: number): number {
  return MAX_LAT[row] ?? 0;
}

export interface WallSlot {
  row: number;
  lat: number;
  cell: Vec2;
  /** Wall on the far edge (facing the viewer). */
  front: boolean;
  /** Wall on the viewer's-left / viewer's-right edge of this cell. */
  left: boolean;
  right: boolean;
}

interface Pose {
  pos: Vec2;
  facing: Dir;
}

/** Back-to-front, outer-to-inner list of visible open cells with walls. */
export function buildScene(level: Level, pose: Pose): WallSlot[] {
  const fwd = delta(pose.facing);
  const rgt = delta(turnRight(pose.facing));

  const cellAt = (row: number, lat: number): Vec2 => ({
    x: pose.pos.x + fwd.x * row + rgt.x * lat,
    y: pose.pos.y + fwd.y * row + rgt.y * lat,
  });
  const open = (row: number, lat: number): boolean => {
    const c = cellAt(row, lat);
    return isWalkable(level, c.x, c.y);
  };
  const inFrustum = (row: number, lat: number): boolean =>
    row >= 0 && row < ROWS && Math.abs(lat) <= maxLat(row);

  // Visibility: light passes through open nearer cells. A cell is seen if
  // the cell straight in front of it (A) or the diagonally-inner cell (B)
  // is itself seen AND open. Row 0 (the party cell and its immediate
  // flanks) is always in view. Memoised.
  const seen = new Map<string, boolean>();
  const see = (row: number, lat: number): boolean => {
    if (!inFrustum(row, lat)) return false;
    if (row === 0) return Math.abs(lat) <= 1;
    const key = `${row},${lat}`;
    const cached = seen.get(key);
    if (cached !== undefined) return cached;
    seen.set(key, false); // guard against cycles during recursion
    const s = Math.sign(lat);
    // Light also stops at a solid edge (closed door, thin wall) on the front
    // face of the cell it would pass through — so you can't see past one.
    const a = cellAt(row - 1, lat);
    const throughA =
      see(row - 1, lat) &&
      open(row - 1, lat) &&
      !edgeRendersSolid(level, a.x, a.y, pose.facing);
    const b = cellAt(row - 1, lat - s);
    const throughB =
      lat !== 0 &&
      see(row - 1, lat - s) &&
      open(row - 1, lat - s) &&
      !edgeRendersSolid(level, b.x, b.y, pose.facing);
    const result = throughA || throughB;
    seen.set(key, result);
    return result;
  };

  const wall = (cell: Vec2, dir: Dir): boolean =>
    !isWalkable(level, translate(cell, dir).x, translate(cell, dir).y) ||
    edgeRendersSolid(level, cell.x, cell.y, dir);

  const dirFront = pose.facing;
  const dirLeft = turnLeft(pose.facing);
  const dirRight = turnRight(pose.facing);

  const slots: WallSlot[] = [];
  for (let row = ROWS - 1; row >= 0; row--) {
    for (let abs = maxLat(row); abs >= 0; abs--) {
      const lats = abs === 0 ? [0] : [-abs, abs];
      for (const lat of lats) {
        if (!see(row, lat) || !open(row, lat)) continue;
        const cell = cellAt(row, lat);
        slots.push({
          row,
          lat,
          cell,
          front: wall(cell, dirFront),
          left: wall(cell, dirLeft),
          right: wall(cell, dirRight),
        });
      }
    }
  }
  return slots;
}

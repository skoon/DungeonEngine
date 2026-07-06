/**
 * View-frustum geometry — the projection table (plan §4.1). Pure functions
 * mapping frustum slots (row, lateral) to screen polygons in the viewport's
 * content rect. No canvas here, so the projection is unit-testable.
 *
 * Model: a pinhole-ish projection. The eye sits at the centre of the party
 * cell; a cell at forward row r spans world depth Z in [r-0.5, r+0.5]; its
 * front (viewer-facing) edge is the plane Z = r+0.5. Screen scale = FOCAL/Z,
 * so nearer things are bigger. Walls run half a cell above and below eye
 * level. Lateral cell edges are at half-integer offsets e (… -1.5,-0.5,0.5…).
 */

import { VIEWPORT, inset } from './layout';

const C = inset(VIEWPORT, 5);
export const CONTENT = C;
export const CX = C.x + C.w / 2;
/** Eye level, nudged up so a bit more floor than ceiling shows. */
export const HORIZON = Math.round(C.y + C.h * 0.46);
/** Bigger = walls loom larger; tuned so a wall one cell ahead ~fills. */
const FOCAL = 150;
/** Clamp for row-0 side walls whose near plane sits behind the eye. */
const NEAR = 0.22;

export function scale(z: number): number {
  return FOCAL / z;
}

/** Screen x of a lateral edge `e` (cell units) at depth `z`. */
export function gridX(z: number, e: number): number {
  return CX + e * scale(z);
}

export function ceilY(z: number): number {
  return HORIZON - 0.5 * scale(z);
}

export function floorY(z: number): number {
  return HORIZON + 0.5 * scale(z);
}

export interface FrontRect {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

/** Fronto-parallel far face of cell (row, lat): an axis-aligned rectangle. */
export function frontRect(row: number, lat: number): FrontRect {
  const z = row + 0.5;
  return {
    x0: gridX(z, lat - 0.5),
    x1: gridX(z, lat + 0.5),
    y0: ceilY(z),
    y1: floorY(z),
  };
}

export interface SideQuad {
  nearX: number;
  farX: number;
  nearTop: number;
  nearBot: number;
  farTop: number;
  farBot: number;
}

/**
 * Receding side wall of cell (row, lat) on the viewer's left/right edge,
 * spanning the cell's near plane (Z=row-0.5, clamped) to its far plane
 * (Z=row+0.5). A trapezoid, since near/far project at different scales.
 */
export function sideQuad(row: number, lat: number, side: 'left' | 'right'): SideQuad {
  const e = side === 'left' ? lat - 0.5 : lat + 0.5;
  const nearZ = Math.max(row - 0.5, NEAR);
  const farZ = row + 0.5;
  return {
    nearX: gridX(nearZ, e),
    farX: gridX(farZ, e),
    nearTop: ceilY(nearZ),
    nearBot: floorY(nearZ),
    farTop: ceilY(farZ),
    farBot: floorY(farZ),
  };
}

export interface Point {
  x: number;
  y: number;
}

/** The four floor corners of cell (row, lat), for floor markers/decals. */
export function floorQuad(row: number, lat: number): [Point, Point, Point, Point] {
  const nearZ = Math.max(row - 0.5, NEAR);
  const farZ = row + 0.5;
  return [
    { x: gridX(nearZ, lat - 0.5), y: floorY(nearZ) },
    { x: gridX(nearZ, lat + 0.5), y: floorY(nearZ) },
    { x: gridX(farZ, lat + 0.5), y: floorY(farZ) },
    { x: gridX(farZ, lat - 0.5), y: floorY(farZ) },
  ];
}

export function centroid(pts: readonly Point[]): Point {
  let x = 0;
  let y = 0;
  for (const p of pts) {
    x += p.x;
    y += p.y;
  }
  return { x: x / pts.length, y: y / pts.length };
}

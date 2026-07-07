/**
 * Dungeon map model and cell/edge queries. Pure data + pure functions.
 *
 * Two independent things block movement (plan §3.2):
 *  1. Solid-rock cells — a cell that simply isn't floor. Bumping one is a
 *     "wall" in the game sense.
 *  2. Edge walls — a thin wall (or, from M4, a closed door) sitting on the
 *     boundary between two otherwise-walkable cells.
 *
 * Edge walls are the tricky part: an edge is shared by two neighbouring
 * cells, so it must have exactly one owner or the two sides can disagree
 * (plan §9 risk). We store every edge under a canonical key derived from the
 * cell on its North/West side, and both neighbours resolve through the same
 * key via edgeKey().
 */

import { type Dir, type Vec2, translate } from './grid';
import type { Action } from './triggers';
import type { Item } from './item';
import type { MonsterSpawn } from './monster';

export interface Cell {
  /** Solid rock — unexcavated, never walkable. */
  solid: boolean;
  /** Optional floor trigger (plate, teleporter, pit, spinner, stairs). */
  trigger?: CellTrigger;
  /** Loose items lying on the floor. */
  items?: Item[];
}

/** A wall-mounted button or lever that runs actions when used. */
export interface Interactable {
  kind: 'button' | 'lever';
  actions: Action[];
  /** A one-shot button can only fire once. */
  oneShot?: boolean;
  used?: boolean;
  /** Lever toggle state. */
  on?: boolean;
}

export interface DoorState {
  /** Logical open/closed — drives movement blocking immediately. */
  open: boolean;
  /** Animation 0 (closed) .. 1 (fully retracted); visual only. */
  progress: number;
  /** Renders as an ordinary wall until opened (a secret door). */
  secret?: boolean;
  /** Requires a key with this id to open by hand (a keyhole door). */
  keyId?: string;
}

export interface EdgeWall {
  kind: 'wall' | 'door' | 'illusion';
  /** Blocks movement across the edge (doors update this when toggled). */
  blocksMovement: boolean;
  /** Drawn as a solid face by the renderer (illusions: true; open door: false). */
  rendersSolid: boolean;
  door?: DoorState;
  /** Button/lever mounted on this wall face. */
  interact?: Interactable;
  /** Engraved wall text, surfaced to the log when the party faces it. */
  text?: string;
  /** A wall niche holding items you can take (plan §5). */
  alcove?: Item[];
  /** Set once a Detect Secret spell reveals a hidden illusion/door (plan §6.3). */
  detected?: boolean;
}

/**
 * A floor trigger. Teleporter/spinner/pit behaviour is expressed through the
 * onEnter action list (teleport/spin/message); `kind` drives rendering and a
 * couple of built-in behaviours (pit fall). Plates fire on enter and leave.
 */
export interface CellTrigger {
  kind: 'plate' | 'teleporter' | 'spinner' | 'pit' | 'stairs' | 'walltext' | 'altar';
  onEnter?: Action[];
  onLeave?: Action[];
  /** Whether the renderer draws a floor marker (hidden plates: false). */
  visible?: boolean;
  text?: string;
  /** Destination for stairs/pit level transitions (plan §5/M9). */
  link?: LevelLink;
}

export interface LevelLink {
  /** Index of the target level in the dungeon. */
  level: number;
  pos: Vec2;
  facing?: Dir;
}

export interface Level {
  name: string;
  /** Visual theme id for the renderer (plan M10); defaults to 'brick'. */
  tileset: string;
  width: number;
  height: number;
  /** Row-major, length = width * height. */
  cells: Cell[];
  /** Canonical edge key -> wall. Absent key means "open edge". */
  edges: Map<string, EdgeWall>;
  start: { pos: Vec2; facing: Dir };
  /** Monster spawn placements; the World instantiates live monsters. */
  spawns: MonsterSpawn[];
}

export function cellIndex(level: Level, x: number, y: number): number {
  return y * level.width + x;
}

export function inBounds(level: Level, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < level.width && y < level.height;
}

export function cellAt(level: Level, x: number, y: number): Cell | undefined {
  if (!inBounds(level, x, y)) return undefined;
  return level.cells[cellIndex(level, x, y)];
}

/** In bounds and not solid rock. */
export function isWalkable(level: Level, x: number, y: number): boolean {
  const cell = cellAt(level, x, y);
  return cell !== undefined && !cell.solid;
}

/**
 * Canonical key for the edge on the `dir` side of cell (x, y).
 *
 * Horizontal edges (between a cell and the one South of it) are owned by the
 * North cell: `h:x:y` is the edge below (x, y). Vertical edges (between a
 * cell and the one East) are owned by the West cell: `v:x:y` is the edge to
 * the right of (x, y). So the North side of (x, y) and the South side of
 * (x, y-1) both resolve to `h:x:(y-1)` — one shared owner.
 */
export function edgeKey(x: number, y: number, dir: Dir): string {
  switch (dir) {
    case 0:
      return `h:${x}:${y - 1}`; // N
    case 1:
      return `v:${x}:${y}`; // E
    case 2:
      return `h:${x}:${y}`; // S
    case 3:
      return `v:${x - 1}:${y}`; // W
    default:
      throw new Error(`bad direction ${dir as number}`);
  }
}

export function edgeAt(level: Level, x: number, y: number, dir: Dir): EdgeWall | undefined {
  return level.edges.get(edgeKey(x, y, dir));
}

export function edgeBlocks(level: Level, x: number, y: number, dir: Dir): boolean {
  return level.edges.get(edgeKey(x, y, dir))?.blocksMovement ?? false;
}

/** Whether the renderer should draw a solid face on this edge (walls, closed
 * or animating doors, illusions — but not a fully-open door). */
export function edgeRendersSolid(level: Level, x: number, y: number, dir: Dir): boolean {
  const e = edgeAt(level, x, y, dir);
  if (!e) return false;
  if (e.kind === 'door') return (e.door?.progress ?? 0) < 1 - 1e-6;
  return e.rendersSolid;
}

export function cellTriggerAt(level: Level, x: number, y: number): CellTrigger | undefined {
  return cellAt(level, x, y)?.trigger;
}

/** Why moving from (from) in `dir` is blocked, or null if the step is legal. */
export function blockReason(
  level: Level,
  from: Vec2,
  dir: Dir,
): 'wall' | 'edge' | null {
  if (edgeBlocks(level, from.x, from.y, dir)) return 'edge';
  const to = translate(from, dir);
  if (!isWalkable(level, to.x, to.y)) return 'wall';
  return null;
}

export function canEnter(level: Level, from: Vec2, dir: Dir): boolean {
  return blockReason(level, from, dir) === null;
}

/** Set of cell indices reachable from `start` respecting solids and edges. */
export function reachableCells(level: Level, start: Vec2): Set<number> {
  const seen = new Set<number>();
  if (!isWalkable(level, start.x, start.y)) return seen;
  const queue: Vec2[] = [start];
  seen.add(cellIndex(level, start.x, start.y));
  const dirs: Dir[] = [0, 1, 2, 3];
  while (queue.length > 0) {
    const cur = queue.pop()!;
    for (const dir of dirs) {
      if (!canEnter(level, cur, dir)) continue;
      const next = translate(cur, dir);
      const idx = cellIndex(level, next.x, next.y);
      if (seen.has(idx)) continue;
      seen.add(idx);
      queue.push(next);
    }
  }
  return seen;
}

/** Count of walkable (floor) cells in the level. */
export function floorCount(level: Level): number {
  let n = 0;
  for (const cell of level.cells) if (!cell.solid) n++;
  return n;
}

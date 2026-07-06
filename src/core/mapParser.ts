/**
 * ASCII map parser. Turns a hand-authored layout string into a Level.
 *
 * Cell glyphs:
 *   '#'  solid rock (unwalkable)
 *   ' '  solid rock (convenient bulk fill / off-map)
 *   '.'  floor
 *   '^ > v <'  floor + party start, glyph points the starting facing
 *
 * Every row must be the same width, and there must be exactly one start
 * glyph — both are authoring mistakes worth failing loudly on (plan §7).
 *
 * Thin walls *between two floor cells* (and, later, doors) are not
 * expressible in single-glyph-per-cell ASCII, so they are supplied
 * separately as an `edges` list. Cell-based solid rock already covers all
 * the ordinary "you can't walk there" geometry; edges are only for the rare
 * wall that splits an open corridor. A richer wall notation arrives with
 * doors in M4.
 */

import { type Dir, Dir as D } from './grid';
import type { CellTrigger, EdgeWall, Interactable, Level } from './dungeon';
import { edgeKey } from './dungeon';
import type { Item } from './item';
import type { MonsterSpecies, MonsterSpawn } from './monster';

export interface EdgeSpec {
  x: number;
  y: number;
  dir: Dir;
  /** 'wall' (default) | 'door' | 'illusion'. */
  kind?: EdgeWall['kind'];
  /** Plain-wall/illusion movement blocking; defaults true for walls. */
  blocksMovement?: boolean;
  /** Doors start closed unless open:true. */
  open?: boolean;
  secret?: boolean;
  /** Keyhole door: requires a key with this id to open by hand. */
  keyId?: string;
  interact?: Interactable;
  text?: string;
  /** Items stashed in this wall niche. */
  alcove?: Item[];
}

export interface TriggerSpec extends CellTrigger {
  x: number;
  y: number;
}

export interface FloorSpec {
  x: number;
  y: number;
  items: Item[];
}

export interface MonsterSpec {
  x: number;
  y: number;
  species: MonsterSpecies;
  facing?: Dir;
}

export interface MapSource {
  name: string;
  ascii: string;
  /** Thin walls, doors, illusions, alcoves, and wall-mounted interactables. */
  edges?: EdgeSpec[];
  /** Floor triggers keyed to cells. */
  triggers?: TriggerSpec[];
  /** Loose items lying on cell floors. */
  floor?: FloorSpec[];
  /** Monster spawn placements. */
  monsters?: MonsterSpec[];
}

const START_FACING: Record<string, Dir> = {
  '^': D.N,
  '>': D.E,
  v: D.S,
  '<': D.W,
};

export function parseMap(source: MapSource): Level {
  const rows = source.ascii.replace(/\r\n/g, '\n').split('\n');
  // Trim a single leading/trailing blank line so template literals can start
  // on the line after the backtick.
  if (rows.length > 0 && rows[0] === '') rows.shift();
  if (rows.length > 0 && rows[rows.length - 1]!.trim() === '') rows.pop();

  const height = rows.length;
  if (height === 0) throw new Error('map is empty');
  const width = rows[0]!.length;
  if (width === 0) throw new Error('map has zero-width first row');

  const cells: Level['cells'] = new Array(width * height);
  let start: Level['start'] | undefined;

  for (let y = 0; y < height; y++) {
    const row = rows[y]!;
    if (row.length !== width) {
      throw new Error(
        `row ${y} width ${row.length} != ${width} (rows must be equal width)`,
      );
    }
    for (let x = 0; x < width; x++) {
      const glyph = row[x]!;
      const facing = START_FACING[glyph];
      if (facing !== undefined) {
        if (start) throw new Error(`multiple party starts (second at ${x},${y})`);
        start = { pos: { x, y }, facing };
        cells[y * width + x] = { solid: false };
      } else if (glyph === '.') {
        cells[y * width + x] = { solid: false };
      } else if (glyph === '#' || glyph === ' ') {
        cells[y * width + x] = { solid: true };
      } else {
        throw new Error(`unknown map glyph '${glyph}' at ${x},${y}`);
      }
    }
  }

  if (!start) throw new Error('map has no party start (^ > v <)');

  const edges = new Map<string, EdgeWall>();
  for (const spec of source.edges ?? []) {
    edges.set(edgeKey(spec.x, spec.y, spec.dir), buildEdge(spec));
  }

  for (const spec of source.triggers ?? []) {
    if (spec.x < 0 || spec.y < 0 || spec.x >= width || spec.y >= height) {
      throw new Error(`trigger at ${spec.x},${spec.y} is out of bounds`);
    }
    const { x: _x, y: _y, ...trigger } = spec;
    cells[spec.y * width + spec.x]!.trigger = trigger;
  }

  for (const spec of source.floor ?? []) {
    if (spec.x < 0 || spec.y < 0 || spec.x >= width || spec.y >= height) {
      throw new Error(`floor items at ${spec.x},${spec.y} are out of bounds`);
    }
    cells[spec.y * width + spec.x]!.items = [...spec.items];
  }

  const spawns: MonsterSpawn[] = (source.monsters ?? []).map((m) => {
    if (m.x < 0 || m.y < 0 || m.x >= width || m.y >= height) {
      throw new Error(`monster at ${m.x},${m.y} is out of bounds`);
    }
    return { pos: { x: m.x, y: m.y }, facing: m.facing ?? D.N, species: m.species };
  });

  return { name: source.name, width, height, cells, edges, start, spawns };
}

function buildEdge(spec: EdgeSpec): EdgeWall {
  const kind = spec.kind ?? 'wall';
  const extras = {
    ...(spec.interact ? { interact: spec.interact } : {}),
    ...(spec.text ? { text: spec.text } : {}),
    ...(spec.alcove ? { alcove: [...spec.alcove] } : {}),
  };
  if (kind === 'door') {
    const open = spec.open ?? false;
    const door = {
      open,
      progress: open ? 1 : 0,
      ...(spec.secret ? { secret: true } : {}),
      ...(spec.keyId ? { keyId: spec.keyId } : {}),
    };
    return { kind, blocksMovement: !open, rendersSolid: true, door, ...extras };
  }
  if (kind === 'illusion') {
    return {
      kind,
      blocksMovement: false, // walk right through
      rendersSolid: true, // but it looks like a wall
      ...extras,
    };
  }
  return { kind: 'wall', blocksMovement: spec.blocksMovement ?? true, rendersSolid: true, ...extras };
}

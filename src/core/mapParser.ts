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
import type { EdgeWall, Level } from './dungeon';
import { edgeKey } from './dungeon';

export interface EdgeSpec {
  x: number;
  y: number;
  dir: Dir;
  /** Defaults to true (a solid thin wall). */
  blocksMovement?: boolean;
}

export interface MapSource {
  name: string;
  ascii: string;
  /** Thin walls between open cells; see module docs. */
  edges?: EdgeSpec[];
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
    edges.set(edgeKey(spec.x, spec.y, spec.dir), {
      blocksMovement: spec.blocksMovement ?? true,
    });
  }

  return { name: source.name, width, height, cells, edges, start };
}

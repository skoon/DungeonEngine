/**
 * Level 1 — "The Pillared Hall". A small, fully-connected test level: a
 * pillar grid (corridors weaving around solid columns) plus one thin edge
 * wall in the top corridor so movement tests can exercise edge-blocking
 * distinct from solid-rock-blocking.
 *
 * Party starts at (1, 5) facing East.
 *
 * Glyphs: '#' solid rock, '.' floor, '>' party start facing East.
 */

import { Dir } from '../../core/grid';
import type { MapSource } from '../../core/mapParser';

export const level1: MapSource = {
  name: 'The Pillared Hall',
  ascii: `
#############
#...........#
#.#.#.#.#.#.#
#...........#
#.#.#.#.#.#.#
#>..........#
#.#.#.#.#.#.#
#...........#
#############
`,
  // A thin wall on the East side of (1,1): cells (1,1) and (2,1) are both
  // floor, but you cannot step directly between them — you must go around.
  edges: [{ x: 1, y: 1, dir: Dir.E }],
};

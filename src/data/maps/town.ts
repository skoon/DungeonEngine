/**
 * The Town Hub (plan M-DR4 / DEATH_AND_REVIVAL §5). A small safe level — no
 * monster spawns — reached only by the Town Portal spell. Four service cells,
 * each a 'townhub' cell trigger, ring the central arrival plaza:
 *
 *   - the return portal (north) — steps the party back to where they cast;
 *   - the shrine (west) — raise the dead for gold;
 *   - the notice board (east) — recruit a replacement adventurer;
 *   - the hearth (south) — rest to fully restore the living.
 *
 * The party arrives at the centre ({@link TOWN_ENTRANCE}); the start glyph is
 * only there to satisfy the parser (arrival is by portal, not by walking in).
 */

import { Dir } from '../../core/grid';
import type { MapSource } from '../../core/mapParser';

/** Where the Town Portal deposits the party (the central plaza). */
export const TOWN_ENTRANCE = { pos: { x: 4, y: 3 }, facing: Dir.N };

export const town: MapSource = {
  name: 'Havenreach',
  tileset: 'brick',
  ascii: `
#########
#.......#
#.......#
#...^...#
#.......#
#.......#
#########
`,
  triggers: [
    {
      x: 4, y: 1, kind: 'townhub', service: 'return', visible: true,
      text: 'A shimmering portal hangs in the air, ready to bear you back.',
    },
    {
      x: 1, y: 3, kind: 'townhub', service: 'raise', visible: true,
      text: 'A quiet shrine to the god of second chances.',
    },
    {
      x: 7, y: 3, kind: 'townhub', service: 'recruit', visible: true,
      text: 'A notice board where sellswords wait to be hired.',
    },
    {
      x: 4, y: 5, kind: 'townhub', service: 'rest', visible: true,
      text: 'A warm hearth and clean beds beckon.',
    },
  ],
};

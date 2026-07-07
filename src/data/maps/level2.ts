/**
 * Level 2 — "The Sunless Crypt". Reached by descending the stairs from level
 * 1's exit chamber, or by falling through the pit trap (landing hurt in the
 * middle of the room). A skeleton warren with loot and rations for camping,
 * and stairs back up.
 *
 * Level indices in this dungeon: 0 = The Pillared Hall, 1 = this level.
 */

import { Dir } from '../../core/grid';
import type { MapSource } from '../../core/mapParser';
import { item } from '../items';
import { BONE_LORD, CAVE_SPIDER, GIANT_RAT, SKELETON, ZOMBIE } from '../monsters';

export const level2: MapSource = {
  // The party is placed here by a stairs/pit link, not by walking in, so the
  // start glyph just needs to be a valid floor cell.
  name: 'The Sunless Crypt',
  tileset: 'crypt',
  ascii: `
#############
#>..........#
#...........#
#...........#
#...........#
#...........#
#...........#
#...........#
#############
`,
  edges: [
    // A burial niche holding a healing draught.
    { x: 4, y: 2, dir: Dir.N, alcove: [item('potion_heal')] },
  ],
  triggers: [
    // Stairs back up to level 1's entrance.
    {
      x: 11,
      y: 7,
      kind: 'stairs',
      visible: true,
      text: 'Worn steps climb back toward the Pillared Hall.',
      link: { level: 0, pos: { x: 1, y: 1 }, facing: Dir.E },
    },
    {
      x: 6,
      y: 1,
      kind: 'walltext',
      text: 'Scratched into the stone: "Deeper still the barrow goes..."',
    },
    // A resurrection altar tucked in the far corner (plan M10).
    { x: 1, y: 7, kind: 'altar', visible: true, text: 'A pale altar hums with restorative warmth.' },
  ],
  floor: [
    // Rations to sustain a camp.
    { x: 2, y: 6, items: [item('rations'), item('rations')] },
    { x: 9, y: 3, items: [item('gem')] },
  ],
  monsters: [
    { x: 3, y: 2, species: GIANT_RAT, facing: Dir.S },
    { x: 4, y: 2, species: GIANT_RAT, facing: Dir.S },
    { x: 8, y: 2, species: CAVE_SPIDER, facing: Dir.W },
    { x: 5, y: 5, species: SKELETON, facing: Dir.N },
    { x: 8, y: 6, species: ZOMBIE, facing: Dir.W },
    // The barrow's master, guarding the way back up (pit lands at (6,4)).
    { x: 10, y: 6, species: BONE_LORD, facing: Dir.W },
  ],
};

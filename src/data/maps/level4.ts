/**
 * Level 4 — "The Necropolis". Party ~L4-5. Two long, dead-straight sniping
 * corridors (rows y=1 and y=5, each 15 cells) give the necromancers clean
 * cardinal sightlines so their range-6 shadow bolts open fire well before the
 * party closes. The upper and lower halves connect ONLY through a single
 * 1-wide corridor cell (8,7), where a STONE_GOLEM stands as gatekeeper — the
 * party must kill it to reach the down-stairs chamber (region B, y=8..11). A
 * resurrection altar sits in a spur off the top corridor.
 *
 * Grind loop (M12): like level 1/3, a capped wander trickle restocks the halls
 * so the party can farm toward the L5-6 the Lich fight expects.
 *
 * XP tally (static clear): 2 necromancer (40*2=80) + 1 stone_golem (55) +
 * 2 ghoul (28*2=56) + 1 wraith (22) + 1 crypt_bat (8) = 221 XP, plus wander.
 *
 * Level indices: 0 Pillared Hall, 1 Sunless Crypt, 2 Catacombs, 3 = this level,
 * 4 Lich's Sanctum, 5 Town.
 */

import { Dir } from '../../core/grid';
import type { MapSource } from '../../core/mapParser';
import { item } from '../items';
import { CRYPT_BAT, GHOUL, NECROMANCER, STONE_GOLEM, WRAITH } from '../monsters';

export const level4: MapSource = {
  name: 'The Necropolis',
  tileset: 'catacomb',
  wander: { maxAlive: 3, everyMs: 6000 },
  ascii: `
#################
#>..............#
#.##.##########.#
#.##.##########.#
#.#############.#
#...............#
########.########
########.########
#...............#
#...#.......#...#
#.......#.......#
#...............#
#################
`,
  edges: [
    // A grave-robber's stash tucked in the west wall near the arrival stair.
    { x: 1, y: 5, dir: Dir.W, alcove: [item('potion_heal')] },
  ],
  triggers: [
    // Stairs back UP to the Catacombs (index 2), landing clear of that level's
    // own down-stairs at (13,9).
    {
      x: 1,
      y: 4,
      kind: 'stairs',
      visible: true,
      text: 'Steps climb back toward the Catacombs.',
      link: { level: 2, pos: { x: 12, y: 9 }, facing: Dir.W },
    },
    // Stairs DOWN to the Lich's Sanctum (index 4), past the golem's chokepoint.
    {
      x: 14,
      y: 11,
      kind: 'stairs',
      visible: true,
      text: 'A black stair sinks toward the Lich’s Sanctum.',
      link: { level: 4, pos: { x: 1, y: 1 }, facing: Dir.E },
    },
    // Resurrection altar in the spur off the top corridor.
    { x: 4, y: 3, kind: 'altar', visible: true, text: 'A cold altar of black basalt offers a grim mercy.' },
    {
      x: 8,
      y: 5,
      kind: 'walltext',
      text: 'Warning, half-effaced: "The Warden of stone suffers none to pass below."',
    },
  ],
  floor: [
    { x: 14, y: 8, items: [item('rations'), item('rations')] },
  ],
  monsters: [
    // Necromancers anchoring each sniping corridor, facing down its length so
    // their range-6 bolts reach the party's approach (the corridors are 15
    // cells long; the party enters both at the far end).
    { x: 14, y: 1, species: NECROMANCER, facing: Dir.W },
    { x: 2, y: 5, species: NECROMANCER, facing: Dir.E },
    // A wraith adds a second chill-bolt sniper down the lower corridor.
    { x: 14, y: 5, species: WRAITH, facing: Dir.W },
    // Crackling picket on the upper corridor.
    { x: 7, y: 1, species: CRYPT_BAT, facing: Dir.S },
    // The Warden — parked on the sole chokepoint cell to region B. Kill it or
    // stay barred from the descent.
    { x: 8, y: 7, species: STONE_GOLEM, facing: Dir.N },
    // Ghouls guarding the down-stairs chamber below the chokepoint.
    { x: 5, y: 8, species: GHOUL, facing: Dir.N },
    { x: 11, y: 8, species: GHOUL, facing: Dir.N },
  ],
};

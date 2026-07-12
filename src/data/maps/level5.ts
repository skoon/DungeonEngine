/**
 * Level 5 — "The Lich's Sanctum". The boss finale (party ~L5-6). A cramped
 * antechamber and approach corridor open into a large columned chamber where
 * the LICH waits at the centre. Its M13 phases raise skeletons at two-thirds
 * and one-third HP, so the chamber is kept wide and open (only four corner
 * pillars) to give findSpawnSpot free floor for the summons. Two ghouls flank
 * the Lich — the same 2-ghoul escort the balance pass tuned as the "final
 * fight" matchup. A pair of wraiths haunt the north-east gallery, well clear
 * of the boss so they don't pile into the setpiece.
 *
 * No quest/McGuffin items here — a follow-up task adds those. Just a clean
 * boss chamber and stairs back up to grind/camp/retreat.
 *
 * XP tally (static clear): 1 lich (300) + 2 ghoul (28*2=56) +
 * 2 wraith (22*2=44) = 400 XP.
 *
 * Level indices: 0 Pillared Hall, 1 Sunless Crypt, 2 Catacombs, 3 Necropolis,
 * 4 = this level, 5 Town.
 */

import { Dir } from '../../core/grid';
import type { MapSource } from '../../core/mapParser';
import { item } from '../items';
import { GHOUL, LICH, WRAITH } from '../monsters';

export const level5: MapSource = {
  name: "The Lich's Sanctum",
  tileset: 'sanctum',
  ascii: `
#################
#>..#####.......#
#...............#
#...###.#.......#
#######.#########
####............#
####.#........#.#
####............#
####............#
####............#
####.#........#.#
####............#
#################
`,
  edges: [
    // Last cache before the boss — a healing draught in the antechamber wall.
    { x: 1, y: 1, dir: Dir.N, alcove: [item('potion_heal')] },
  ],
  triggers: [
    // Stairs back UP to the Necropolis (index 3) for a retreat to camp/grind.
    // Lands clear of that level's own down-stairs at (14,11).
    {
      x: 3,
      y: 1,
      kind: 'stairs',
      visible: true,
      text: 'Steps climb back toward the Necropolis.',
      link: { level: 3, pos: { x: 13, y: 11 }, facing: Dir.W },
    },
    {
      x: 5,
      y: 2,
      kind: 'walltext',
      text: 'Graven in frost: "Turn back. The Deathless King keeps no prisoners."',
    },
  ],
  floor: [
    { x: 2, y: 2, items: [item('rations')] },
  ],
  monsters: [
    // The Lich at the heart of the chamber, open floor on every side for its
    // phase summons.
    { x: 9, y: 8, species: LICH, facing: Dir.W },
    // The 2-ghoul escort (balance-tested "final fight" matchup).
    { x: 8, y: 8, species: GHOUL, facing: Dir.W },
    { x: 10, y: 8, species: GHOUL, facing: Dir.E },
    // Wraiths lurking in the north-east gallery, apart from the boss.
    { x: 11, y: 1, species: WRAITH, facing: Dir.S },
    { x: 13, y: 3, species: WRAITH, facing: Dir.S },
  ],
};

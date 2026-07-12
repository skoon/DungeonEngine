/**
 * Level 3 — "The Catacombs". The mid-game grind floor (party arrives ~L3-4 by
 * descending the stairs beyond the Bone Lord's chamber on level 2, or climbing
 * back down from the Necropolis). Two burial galleries of pillared niches,
 * ghoul- and crypt-bat-infested, joined by a divider with three passages —
 * the central one is a SECRET door sealing a shortcut, revealed by a hidden
 * button on its north face (level-1 style secret + walltext hint).
 *
 * Grind loop (M12): a capped trickle of wandering undead restocks the galleries
 * so the party can farm XP toward L5 before pressing on. maxAlive 3 / 6s, tuned
 * like level 1's.
 *
 * XP tally (static clear): 3 ghoul (28*3=84) + 2 crypt_bat (8*2=16) +
 * 1 cave_spider (10) = 110 XP. The `wander` loop supplies the rest.
 *
 * Level indices: 0 Pillared Hall, 1 Sunless Crypt, 2 = this level,
 * 3 Necropolis, 4 Lich's Sanctum, 5 Town.
 */

import { Dir } from '../../core/grid';
import type { MapSource } from '../../core/mapParser';
import { item } from '../items';
import { CAVE_SPIDER, CRYPT_BAT, GHOUL } from '../monsters';

export const level3: MapSource = {
  // Reached by a stairs link, so the start glyph just marks a valid floor cell.
  name: 'The Catacombs',
  tileset: 'catacomb',
  wander: { maxAlive: 3, everyMs: 6000 },
  ascii: `
###############
#>............#
#...#.....#...#
#......#......#
#...#.....#...#
###.###.###.###
#...#.....#...#
#......#......#
#...#.....#...#
#.............#
###############
`,
  edges: [
    // Secret door sealing the central divider passage — looks like solid rock
    // until the hidden button is pressed. The east/west passages (x=3, x=11)
    // stay open, so this only ever unlocks a shortcut.
    { x: 7, y: 4, dir: Dir.S, kind: 'door', secret: true },
    // Hidden button on the pillar face just north of the sealed passage.
    {
      x: 7,
      y: 4,
      dir: Dir.N,
      interact: {
        kind: 'button',
        actions: [
          { do: 'openDoor', edge: { x: 7, y: 4, dir: Dir.S } },
          { do: 'message', channel: 'loot', text: 'Grave-dust sifts down — a sealed passage grinds open.' },
        ],
      },
    },
    // Burial niches holding camp supplies.
    { x: 13, y: 7, dir: Dir.E, alcove: [item('potion_heal')] },
    { x: 1, y: 3, dir: Dir.W, alcove: [item('gem')] },
  ],
  triggers: [
    // Stairs back UP to the Sunless Crypt (level 1 in the array), landing clear
    // of that level's own down-stairs so the party doesn't bounce.
    {
      x: 2,
      y: 1,
      kind: 'stairs',
      visible: true,
      text: 'Cramped steps wind back up toward the Sunless Crypt.',
      link: { level: 1, pos: { x: 9, y: 7 }, facing: Dir.N },
    },
    // Stairs DOWN to the Necropolis (level 3 in the array).
    {
      x: 13,
      y: 9,
      kind: 'stairs',
      visible: true,
      text: 'A worn stair descends into the reek of the Necropolis.',
      link: { level: 3, pos: { x: 1, y: 1 }, facing: Dir.E },
    },
    {
      x: 6,
      y: 1,
      kind: 'walltext',
      text: 'Chiselled deep: "The middle road is walled; press the stone to pass."',
    },
  ],
  floor: [
    { x: 2, y: 9, items: [item('rations'), item('rations')] },
    { x: 12, y: 2, items: [item('gem')] },
  ],
  // Ghoul and crypt-bat territory, kept off the stairs and solution cells so
  // they wake and give chase. A lone cave spider lurks in the lower gallery.
  monsters: [
    { x: 8, y: 3, species: GHOUL, facing: Dir.W },
    { x: 6, y: 7, species: GHOUL, facing: Dir.N },
    { x: 3, y: 8, species: GHOUL, facing: Dir.E },
    { x: 11, y: 2, species: CRYPT_BAT, facing: Dir.S },
    { x: 2, y: 6, species: CRYPT_BAT, facing: Dir.E },
    { x: 12, y: 7, species: CAVE_SPIDER, facing: Dir.W },
  ],
};

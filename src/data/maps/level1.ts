/**
 * Level 1 — "The Pillared Hall". A compact puzzle that exercises the M4
 * furniture end to end (plan M4 "done when"):
 *
 *   plate -> door : a pressure plate (6,3) opens the inner door D1, letting
 *                   the party descend into the lower hall.
 *   button -> teleporter : a wall button (2,7) opens door D2, which guards a
 *                   teleport booth (9,6) that warps the party to the exit.
 *   secret wall  : a hidden button (N of 4,5) slides aside a secret door
 *                   (E of 4,5) — indistinguishable from a wall until opened.
 *
 * Plus flavour: an illusory wall (N of 3,3) you can walk through, a visible
 * pit trap (3,6), and an engraved hint. The exit cell (11,6) is sealed off
 * and reachable only through the teleporter.
 *
 * Glyphs: '#' solid rock, '.' floor, '>' party start facing East. All
 * furniture is placed by coordinate in edges/triggers below.
 */

import { Dir } from '../../core/grid';
import type { MapSource } from '../../core/mapParser';
import { item } from '../items';
import { KOBOLD, SKELETON } from '../monsters';

export const level1: MapSource = {
  name: 'The Pillared Hall',
  ascii: `
#############
#>..........#
#...........#
#...........#
######.######
#........#.##
#.........#.#
#........####
#############
`,
  edges: [
    // D1 — inner door, opened by the pressure plate.
    { x: 6, y: 4, dir: Dir.N, kind: 'door' },
    // D2 — guards the teleport booth, opened by the wall button.
    { x: 8, y: 6, dir: Dir.E, kind: 'door' },
    // Secret door — looks like solid wall until the hidden button is found.
    { x: 4, y: 5, dir: Dir.E, kind: 'door', secret: true },
    // Illusory wall — renders solid, but you pass right through.
    { x: 3, y: 3, dir: Dir.N, kind: 'illusion' },
    // Wall button: opens D2 (button -> teleporter).
    {
      x: 2,
      y: 7,
      dir: Dir.S,
      interact: {
        kind: 'button',
        actions: [
          { do: 'openDoor', edge: { x: 8, y: 6, dir: Dir.E } },
          { do: 'message', channel: 'system', text: 'Gears clank — a door grinds open to the east.' },
        ],
      },
    },
    // Hidden button: reveals the secret door.
    {
      x: 4,
      y: 5,
      dir: Dir.N,
      interact: {
        kind: 'button',
        actions: [
          { do: 'openDoor', edge: { x: 4, y: 5, dir: Dir.E } },
          { do: 'message', channel: 'loot', text: 'A section of wall slides aside!' },
        ],
      },
    },
    // Engraved hint on the north wall.
    { x: 6, y: 1, dir: Dir.N, kind: 'wall', text: '"WEIGHT OPENS THE WAY"' },
    // A wall niche holding a gem — loot it by facing it and pressing use.
    { x: 9, y: 1, dir: Dir.N, alcove: [item('gem')] },
  ],
  floor: [
    // Loose rations on the floor of the entry hall.
    { x: 2, y: 2, items: [item('rations')] },
  ],
  // Undead and a kobold guarding the lower hall (kept off the exact solution
  // cells so they wake and give chase rather than hard-blocking the route).
  monsters: [
    { x: 3, y: 5, species: SKELETON, facing: Dir.S },
    { x: 7, y: 6, species: SKELETON, facing: Dir.W },
    { x: 4, y: 5, species: KOBOLD, facing: Dir.S },
  ],
  triggers: [
    {
      x: 3,
      y: 1,
      kind: 'walltext',
      text: 'A worn inscription: "Only weight shall part the inner wall."',
    },
    {
      x: 6,
      y: 3,
      kind: 'plate',
      visible: true,
      onEnter: [
        { do: 'openDoor', edge: { x: 6, y: 4, dir: Dir.N } },
        { do: 'message', channel: 'system', text: 'The plate sinks — a stone grinds open below.' },
      ],
      onLeave: [{ do: 'closeDoor', edge: { x: 6, y: 4, dir: Dir.N } }],
    },
    // Pit trap: drops the party into the middle of the crypt below (hurt).
    { x: 3, y: 6, kind: 'pit', visible: true, link: { level: 1, pos: { x: 6, y: 4 }, facing: Dir.S } },
    {
      x: 9,
      y: 6,
      kind: 'teleporter',
      visible: true,
      onEnter: [{ do: 'teleport', to: { x: 11, y: 6 } }],
    },
    {
      x: 11,
      y: 6,
      kind: 'stairs',
      visible: true,
      text: 'A stair spirals down into the dark.',
      link: { level: 1, pos: { x: 1, y: 1 }, facing: Dir.E },
    },
  ],
};

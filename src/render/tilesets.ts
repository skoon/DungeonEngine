/**
 * Wall tilesets (plan M10). Each level names a tileset; the viewport picks
 * the matching palette ramps so different floors read distinctly (brick
 * hall vs. sunless crypt) while staying within the shared 16-colour palette.
 */

import { SWEETIE16 } from './palette';

export interface Tileset {
  /** Front-face fill per depth row (0 near .. 3 far). */
  front: [string, string, string, string];
  /** Side-face fill per depth row. */
  side: [string, string, string, string];
  /** Ceiling bands, top -> horizon. */
  ceiling: [string, string, string];
  /** Floor bands, horizon -> feet. */
  floor: [string, string, string];
  mortar: string;
  door: string;
  doorTrim: string;
}

const BRICK: Tileset = {
  front: [SWEETIE16.gray, SWEETIE16.slate, SWEETIE16.ink, SWEETIE16.navy],
  side: [SWEETIE16.slate, SWEETIE16.ink, SWEETIE16.navy, SWEETIE16.black],
  ceiling: [SWEETIE16.black, SWEETIE16.navy, SWEETIE16.ink],
  floor: [SWEETIE16.slate, SWEETIE16.ink, SWEETIE16.black],
  mortar: SWEETIE16.black,
  door: SWEETIE16.teal,
  doorTrim: SWEETIE16.cyan,
};

// Cooler, mossier stone for the crypt.
const CRYPT: Tileset = {
  front: [SWEETIE16.gray, SWEETIE16.slate, SWEETIE16.teal, SWEETIE16.ink],
  side: [SWEETIE16.slate, SWEETIE16.teal, SWEETIE16.navy, SWEETIE16.black],
  ceiling: [SWEETIE16.black, SWEETIE16.navy, SWEETIE16.teal],
  floor: [SWEETIE16.teal, SWEETIE16.ink, SWEETIE16.black],
  mortar: SWEETIE16.black,
  door: SWEETIE16.green,
  doorTrim: SWEETIE16.lime,
};

export const TILESETS: Record<string, Tileset> = { brick: BRICK, crypt: CRYPT };

export function getTileset(id: string): Tileset {
  return TILESETS[id] ?? BRICK;
}

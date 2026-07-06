/**
 * Master palette (sweetie-16) and the semantic colour roles the UI draws
 * with. Keeping every colour behind a name here means a future re-skin is a
 * one-file change, and the pixel-art discipline (a single shared palette,
 * plan §2.4) is enforced by construction.
 */

import type { LogChannel } from '../core/events';

export const SWEETIE16 = {
  black: '#1a1c2c',
  purple: '#5d275d',
  red: '#b13e53',
  orange: '#ef7d57',
  yellow: '#ffcd75',
  lime: '#a7f070',
  green: '#38b764',
  teal: '#257179',
  navy: '#29366f',
  blue: '#3b5dc9',
  azure: '#41a6f6',
  cyan: '#73eff7',
  white: '#f4f4f4',
  gray: '#94b0c2',
  slate: '#566c86',
  ink: '#333c57',
} as const;

export const COLORS = {
  bg: SWEETIE16.black,
  contentBg: SWEETIE16.black,

  // Stone-frame chrome bevel.
  frameFace: SWEETIE16.slate,
  frameHi: SWEETIE16.gray,
  frameLo: SWEETIE16.ink,

  text: SWEETIE16.white,
  textDim: SWEETIE16.gray,
  title: SWEETIE16.yellow,

  // Party cards.
  hpFill: SWEETIE16.red,
  hpBack: SWEETIE16.ink,
  manaFill: SWEETIE16.azure,
  slotBg: SWEETIE16.black,
  slotBorder: SWEETIE16.slate,
  compassOn: SWEETIE16.yellow,
  compassOff: SWEETIE16.slate,

  // Minimap.
  mapFloor: SWEETIE16.slate,
  mapSolid: SWEETIE16.ink,
  mapEdge: SWEETIE16.yellow,
  mapParty: SWEETIE16.lime,
} as const;

/** Log line colour by channel (plan §2.3). */
export const CHANNEL_COLOR: Record<LogChannel, string> = {
  combat: SWEETIE16.white,
  damage: SWEETIE16.red,
  loot: SWEETIE16.yellow,
  ambient: SWEETIE16.gray,
  system: SWEETIE16.cyan,
};

/** Class accent colours for placeholder party cards. */
export const CLASS_COLOR: Record<string, string> = {
  Fighter: SWEETIE16.red,
  Cleric: SWEETIE16.yellow,
  Mage: SWEETIE16.azure,
  Thief: SWEETIE16.lime,
};

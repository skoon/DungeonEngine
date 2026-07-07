/**
 * Spell registry (plan §6.3). The six starter spells. Content data — a
 * future spells.json would slot in here unchanged.
 */

import type { SpellDef } from '../core/spell';

export const SPELLS: Record<string, SpellDef> = {
  magic_missile: {
    id: 'magic_missile', name: 'Magic Missile', mpCost: 3, castMs: 500,
    kind: 'projectile', damage: [1, 4], glyph: '*', color: '#41a6f6',
  },
  burning_hands: {
    id: 'burning_hands', name: 'Burning Hands', mpCost: 4, castMs: 900,
    kind: 'cone', damage: [2, 4],
  },
  shield: {
    id: 'shield', name: 'Shield', mpCost: 3, castMs: 300,
    kind: 'buff', acBonus: 4, buffMs: 15000,
  },
  cure_wounds: {
    id: 'cure_wounds', name: 'Cure Wounds', mpCost: 4, castMs: 500,
    kind: 'heal', healDice: [2, 6],
  },
  light: {
    id: 'light', name: 'Light', mpCost: 2, castMs: 300,
    kind: 'light', lightMs: 60000,
  },
  detect_secret: {
    id: 'detect_secret', name: 'Detect Secret', mpCost: 3, castMs: 400,
    kind: 'detect', detectRadius: 3,
  },
};

export function spell(id: string): SpellDef {
  const def = SPELLS[id];
  if (!def) throw new Error(`unknown spell '${id}'`);
  return def;
}

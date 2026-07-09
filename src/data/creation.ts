/**
 * Party creation (plan M10). Pure helpers for rolling adventurers: 4d6-drop-
 * lowest stats, per-class starting kit, and building live Characters from the
 * editable creation model. The screen (render/createScreen.ts) and its input
 * live elsewhere; this module owns the rules so they're testable.
 */

import {
  type Character, type Clazz, type Equipment, type Stats, makeCharacter, statMod,
} from '../core/character';
import type { Item } from '../core/item';
import type { SpellDef } from '../core/spell';
import type { Rng } from '../core/rng';
import { CLASSES } from './classes';
import { item } from './items';
import { spell } from './spells';

export const CLASS_ORDER: Clazz[] = ['fighter', 'cleric', 'mage', 'thief'];

const NAME_POOL = [
  'Kestra', 'Bram', 'Sable', 'Pip', 'Thane', 'Iona', 'Doran', 'Mirela',
  'Garruk', 'Fenn', 'Wren', 'Orsik', 'Lyra', 'Corin', 'Vesna', 'Halric',
  'Ada', 'Rurik', 'Sindri', 'Nimue',
];

/** One editable adventurer on the creation screen. */
export interface CreationMember {
  name: string;
  clazz: Clazz;
  stats: Stats;
}

function roll4d6DropLowest(rng: Rng): number {
  const r = [rng.int(1, 6), rng.int(1, 6), rng.int(1, 6), rng.int(1, 6)].sort((a, b) => a - b);
  return r[1]! + r[2]! + r[3]!;
}

export function rollStats(rng: Rng): Stats {
  return {
    str: roll4d6DropLowest(rng),
    dex: roll4d6DropLowest(rng),
    con: roll4d6DropLowest(rng),
    int: roll4d6DropLowest(rng),
    wis: roll4d6DropLowest(rng),
  };
}

export function randomName(rng: Rng, taken: readonly string[]): string {
  const free = NAME_POOL.filter((n) => !taken.includes(n));
  const pool = free.length > 0 ? free : NAME_POOL;
  return rng.pick(pool);
}

/** Derived HP/MP for a class + stats (previewed on screen, applied at build). */
export function previewHpMp(clazz: Clazz, stats: Stats): { hpMax: number; mpMax: number } {
  const def = CLASSES[clazz];
  return {
    hpMax: def.hitDie + statMod(stats.con) + 8,
    mpMax: def.caster ? 6 + statMod(Math.max(stats.int, stats.wis)) : 0,
  };
}

interface Kit {
  hands: [Item | null, Item | null];
  equipment: Equipment;
  backpack: (Item | null)[];
  spells: SpellDef[];
}

function startingKit(clazz: Clazz): Kit {
  switch (clazz) {
    case 'fighter':
      return { hands: [item('short_sword'), null], equipment: { armor: item('leather_armor') }, backpack: [item('rations')], spells: [] };
    case 'cleric':
      return { hands: [null, item('wooden_shield')], equipment: {}, backpack: [item('potion_heal'), item('rations')], spells: [spell('cure_wounds'), spell('shield'), spell('light'), spell('town_portal')] };
    case 'mage':
      return { hands: [null, null], equipment: {}, backpack: [item('dagger')], spells: [spell('magic_missile'), spell('burning_hands'), spell('detect_secret')] };
    case 'thief':
      return { hands: [item('dagger'), null], equipment: {}, backpack: [item('iron_key')], spells: [] };
  }
}

export function createMember(m: CreationMember, portrait: number): Character {
  const def = CLASSES[m.clazz];
  const { hpMax, mpMax } = previewHpMp(m.clazz, m.stats);
  return makeCharacter({
    name: m.name || CLASSES[m.clazz].name,
    clazz: m.clazz,
    portrait,
    stats: { ...m.stats },
    hpMax,
    mpMax,
    hitDie: def.hitDie,
    ...startingKit(m.clazz),
  });
}

export function buildParty(members: CreationMember[]): Character[] {
  return members.map((m, i) => createMember(m, i));
}

/** A rolled starting roster: the four classic classes, distinct names. */
export function defaultCreationParty(rng: Rng): CreationMember[] {
  const taken: string[] = [];
  return CLASS_ORDER.map((clazz) => {
    const name = randomName(rng, taken);
    taken.push(name);
    return { name, clazz, stats: rollStats(rng) };
  });
}

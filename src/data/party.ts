/**
 * The starting party of four pre-generated adventurers with their kit
 * (plan §2.2). Content data assembled from the class and item registries.
 */

import { type Character, type Clazz, type Equipment, makeCharacter, statMod } from '../core/character';
import type { Item } from '../core/item';
import type { SpellDef } from '../core/spell';
import { CLASSES } from './classes';
import { item } from './items';
import { spell } from './spells';

interface Gear {
  hands?: [Item | null, Item | null];
  equipment?: Equipment;
  backpack?: (Item | null)[];
  spells?: SpellDef[];
}

function build(name: string, clazz: Clazz, portrait: number, gear: Gear): Character {
  const def = CLASSES[clazz];
  const hpMax = def.hitDie + statMod(def.stats.con) + 8;
  const mpMax = def.caster ? 6 + statMod(Math.max(def.stats.int, def.stats.wis)) : 0;
  return makeCharacter({ name, clazz, portrait, stats: { ...def.stats }, hpMax, mpMax, ...gear });
}

export function defaultParty(): Character[] {
  return [
    build('Kestra', 'fighter', 0, {
      hands: [item('short_sword'), null],
      equipment: { armor: item('leather_armor') },
      backpack: [item('rations'), item('torch')],
    }),
    build('Bram', 'cleric', 1, {
      hands: [null, item('wooden_shield')],
      backpack: [item('potion_heal')],
      spells: [spell('cure_wounds'), spell('shield'), spell('light')],
    }),
    build('Sable', 'mage', 2, {
      backpack: [item('dagger')],
      spells: [spell('magic_missile'), spell('burning_hands'), spell('detect_secret')],
    }),
    build('Pip', 'thief', 3, {
      hands: [item('dagger'), null],
      backpack: [item('iron_key')],
    }),
  ];
}

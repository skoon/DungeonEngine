/**
 * Character model (plan §3.3). Derived values — AC, attack bonus, carried
 * weight — are pure functions of the character, computed on demand so they
 * can never go stale.
 */

import { type Item, itemWeight } from './item';
import type { SpellDef } from './spell';

export type Clazz = 'fighter' | 'cleric' | 'mage' | 'thief';
export type Condition = 'poisoned' | 'paralyzed' | 'unconscious' | 'dead';

/** A temporary combat buff (e.g. Shield). Non-optional and null-defaulted,
 * matching the Item|null convention, so exactOptionalPropertyTypes never
 * forces an explicit `undefined` assignment when it expires. */
export interface Buff {
  acBonus: number;
  msLeft: number;
}

export interface Stats {
  str: number;
  dex: number;
  con: number;
  int: number;
  wis: number;
}

export interface Equipment {
  armor?: Item | null;
  helm?: Item | null;
  shield?: Item | null;
  boots?: Item | null;
  ring?: Item | null;
}

export const BACKPACK_SIZE = 14;
export const EQUIP_SLOTS = ['armor', 'helm', 'shield', 'boots', 'ring'] as const;
export type EquipSlot = (typeof EQUIP_SLOTS)[number];

export interface Character {
  name: string;
  portrait: number;
  clazz: Clazz;
  stats: Stats;
  /** Hit die (from the class) used for HP growth on level-up. */
  hitDie: number;
  level: number;
  xp: number;
  hp: { cur: number; max: number };
  mp: { cur: number; max: number };
  conditions: Set<Condition>;
  hands: [Item | null, Item | null];
  cooldowns: [number, number];
  equipment: Equipment;
  backpack: (Item | null)[];
  spells: SpellDef[];
  spellCooldown: number;
  buff: Buff | null;
}

export function statMod(v: number): number {
  return Math.floor((v - 10) / 2);
}

/** Ascending armour class: 10 + dex + armour/shield bonuses + active buffs. */
export function armorClass(c: Character): number {
  let ac = 10 + statMod(c.stats.dex) + (c.buff?.acBonus ?? 0);
  for (const it of Object.values(c.equipment)) if (it?.tpl.ac) ac += it.tpl.ac;
  for (const h of c.hands) if (h?.tpl.slot === 'shield' && h.tpl.ac) ac += h.tpl.ac;
  return ac;
}

export function attackBonus(c: Character): number {
  return c.level + statMod(c.stats.str);
}

/** Damage dice for a hand's weapon, or bare-fist 1d2. */
export function weaponDamage(c: Character, hand: 0 | 1): [number, number] {
  return c.hands[hand]?.tpl.damage ?? [1, 2];
}

export function carriedWeight(c: Character): number {
  let w = 0;
  for (const h of c.hands) if (h) w += itemWeight(h);
  for (const it of Object.values(c.equipment)) if (it) w += itemWeight(it);
  for (const it of c.backpack) if (it) w += itemWeight(it);
  return w;
}

export function isDisabled(c: Character): boolean {
  return c.hp.cur <= 0 || c.conditions.has('unconscious') || c.conditions.has('dead');
}

export function firstFreePack(c: Character): number {
  return c.backpack.findIndex((s) => s === null);
}

export interface CharacterConfig {
  name: string;
  clazz: Clazz;
  portrait: number;
  stats: Stats;
  hpMax: number;
  mpMax: number;
  hitDie?: number;
  level?: number;
  hands?: [Item | null, Item | null];
  equipment?: Equipment;
  backpack?: (Item | null)[];
  spells?: SpellDef[];
}

export function makeCharacter(cfg: CharacterConfig): Character {
  const backpack = new Array<Item | null>(BACKPACK_SIZE).fill(null);
  (cfg.backpack ?? []).forEach((it, i) => {
    if (i < BACKPACK_SIZE) backpack[i] = it;
  });
  return {
    name: cfg.name,
    portrait: cfg.portrait,
    clazz: cfg.clazz,
    stats: cfg.stats,
    hitDie: cfg.hitDie ?? 8,
    level: cfg.level ?? 1,
    xp: 0,
    hp: { cur: cfg.hpMax, max: cfg.hpMax },
    mp: { cur: cfg.mpMax, max: cfg.mpMax },
    conditions: new Set(),
    hands: cfg.hands ?? [null, null],
    cooldowns: [0, 0],
    equipment: cfg.equipment ?? {},
    backpack,
    spells: cfg.spells ?? [],
    spellCooldown: 0,
    buff: null,
  };
}

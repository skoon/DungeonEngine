/**
 * Save / load (plan §7/M9). The entire mutable game state — party, every
 * level's items/doors/monsters, RNG, and current floor — serializes to one
 * JSON blob and back. Lives outside src/core so it can own the item / spell
 * / monster registries needed to rehydrate ids into live objects; the core
 * stays data-agnostic and just hands over id-based snapshots.
 */

import {
  type Condition, type EquipSlot, type Character, type Equipment, EQUIP_SLOTS, makeCharacter,
} from '../core/character';
import type { Item } from '../core/item';
import type { Roster } from '../core/roster';
import type { Rng } from '../core/rng';
import type { ItemRef, World, WorldSnapshot } from '../core/world';
import { item } from '../data/items';
import { SPELLS } from '../data/spells';
import { MONSTERS, SKELETON } from '../data/monsters';

const VERSION = 1;
export const SAVE_KEY = 'dungeonengine.save.v1';

interface CharSave {
  name: string;
  portrait: number;
  clazz: Character['clazz'];
  stats: Character['stats'];
  level: number;
  xp: number;
  hpCur: number;
  hpMax: number;
  mpCur: number;
  mpMax: number;
  conditions: string[];
  hands: (ItemRef | null)[];
  equipment: Record<string, ItemRef | null>;
  backpack: (ItemRef | null)[];
  cooldowns: [number, number];
  spellCooldown: number;
  buff: { acBonus: number; msLeft: number } | null;
  spells: string[];
}

interface GameSave {
  version: number;
  rng: number;
  roster: CharSave[];
  world: WorldSnapshot;
}

// --- id <-> instance rehydration -------------------------------------------

function itemRefOrNull(it: Item | null): ItemRef | null {
  if (!it) return null;
  return {
    id: it.tpl.id,
    ...(it.count !== undefined ? { count: it.count } : {}),
    ...(it.charges !== undefined ? { charges: it.charges } : {}),
  };
}

function rehydrateItem(ref: ItemRef): Item {
  const it = item(ref.id);
  if (ref.count !== undefined) it.count = ref.count;
  if (ref.charges !== undefined) it.charges = ref.charges;
  return it;
}

function refToItem(ref: ItemRef | null): Item | null {
  return ref ? rehydrateItem(ref) : null;
}

// --- roster (de)serialization ----------------------------------------------

function saveChar(c: Character): CharSave {
  const equipment: Record<string, ItemRef | null> = {};
  for (const slot of EQUIP_SLOTS) equipment[slot] = itemRefOrNull(c.equipment[slot] ?? null);
  return {
    name: c.name,
    portrait: c.portrait,
    clazz: c.clazz,
    stats: { ...c.stats },
    level: c.level,
    xp: c.xp,
    hpCur: c.hp.cur,
    hpMax: c.hp.max,
    mpCur: c.mp.cur,
    mpMax: c.mp.max,
    conditions: [...c.conditions],
    hands: c.hands.map(itemRefOrNull),
    equipment,
    backpack: c.backpack.map(itemRefOrNull),
    cooldowns: [c.cooldowns[0], c.cooldowns[1]],
    spellCooldown: c.spellCooldown,
    buff: c.buff ? { acBonus: c.buff.acBonus, msLeft: c.buff.msLeft } : null,
    spells: c.spells.map((s) => s.id),
  };
}

function loadChar(cs: CharSave): Character {
  const equipment: Equipment = {};
  for (const slot of EQUIP_SLOTS as readonly EquipSlot[]) equipment[slot] = refToItem(cs.equipment[slot] ?? null);
  const c = makeCharacter({
    name: cs.name,
    clazz: cs.clazz,
    portrait: cs.portrait,
    stats: cs.stats,
    hpMax: cs.hpMax,
    mpMax: cs.mpMax,
    level: cs.level,
    hands: [refToItem(cs.hands[0] ?? null), refToItem(cs.hands[1] ?? null)],
    equipment,
    backpack: cs.backpack.map(refToItem),
    spells: cs.spells.map((id) => SPELLS[id]).filter((s): s is NonNullable<typeof s> => !!s),
  });
  c.hp.cur = cs.hpCur;
  c.mp.cur = cs.mpCur;
  c.xp = cs.xp;
  c.conditions = new Set(cs.conditions as Condition[]);
  c.cooldowns = [cs.cooldowns[0], cs.cooldowns[1]];
  c.spellCooldown = cs.spellCooldown;
  c.buff = cs.buff ? { acBonus: cs.buff.acBonus, msLeft: cs.buff.msLeft } : null;
  return c;
}

// --- public API -------------------------------------------------------------

export function serialize(world: World, roster: Roster, rng: Rng): string {
  const save: GameSave = {
    version: VERSION,
    rng: rng.getState(),
    roster: roster.members.map(saveChar),
    world: world.snapshot(),
  };
  return JSON.stringify(save);
}

/** Apply a save blob onto the live world/roster/rng (mutated in place so
 * existing references stay valid). Returns false on a version mismatch or
 * malformed data. */
export function deserialize(json: string, world: World, roster: Roster, rng: Rng): boolean {
  let save: GameSave;
  try {
    save = JSON.parse(json) as GameSave;
  } catch {
    return false;
  }
  if (save.version !== VERSION || !Array.isArray(save.roster) || !save.world) return false;

  rng.setState(save.rng);
  save.roster.forEach((cs, i) => {
    roster.members[i] = loadChar(cs);
    roster.hurt[i] = 0;
    roster.healFlash[i] = 0;
  });
  world.applySnapshot(save.world, {
    item: rehydrateItem,
    species: (id) => MONSTERS[id] ?? SKELETON,
  });
  return true;
}

// --- localStorage convenience (browser only) --------------------------------

export function saveToStorage(world: World, roster: Roster, rng: Rng): void {
  try {
    localStorage.setItem(SAVE_KEY, serialize(world, roster, rng));
  } catch {
    /* storage unavailable / full — ignore */
  }
}

export function loadFromStorage(world: World, roster: Roster, rng: Rng): boolean {
  try {
    const json = localStorage.getItem(SAVE_KEY);
    return json ? deserialize(json, world, roster, rng) : false;
  } catch {
    return false;
  }
}

export function hasSave(): boolean {
  try {
    return localStorage.getItem(SAVE_KEY) !== null;
  } catch {
    return false;
  }
}

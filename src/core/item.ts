/**
 * Items (plan §6.2). Instances reference a shared template and carry only
 * their per-instance state (stack count, charges). The template is held by
 * direct reference so stat maths never needs a registry lookup; the data
 * layer (data/items.ts) owns the registry and the `item()` factory.
 */

export type ItemSlot = 'weapon' | 'shield' | 'armor' | 'helm' | 'boots' | 'ring' | 'misc';

export interface ItemTemplate {
  id: string;
  name: string;
  /** 1-2 char programmer-art icon until a sprite sheet exists. */
  glyph: string;
  color: string;
  slot: ItemSlot;
  weight: number;
  /** Weapon: damage dice [count, sides] and per-hand cooldown. */
  damage?: [number, number];
  cooldownMs?: number;
  thrown?: boolean;
  reach?: boolean;
  /** Armour AC bonus (higher AC is better, plan §6.1). */
  ac?: number;
  /** Consumables. */
  food?: number;
  heal?: number;
  /** Key that opens doors with the matching keyId. */
  keyId?: string;
  stackable?: boolean;
}

export interface Item {
  tpl: ItemTemplate;
  count?: number;
  charges?: number;
}

export function itemWeight(item: Item): number {
  return item.tpl.weight * (item.count ?? 1);
}

export function isWeapon(item: Item): boolean {
  return item.tpl.slot === 'weapon';
}

/** Whether an item may be placed in a given equipment slot. */
export function fitsEquipSlot(slot: ItemSlot, item: Item): boolean {
  return item.tpl.slot === slot;
}

/**
 * Item registry (plan §6.2). Content data — a future items.json would slot
 * in here unchanged. Glyphs are ASCII programmer-art icons until a real
 * sprite sheet lands.
 */

import type { Item, ItemTemplate } from '../core/item';

export const ITEMS: Record<string, ItemTemplate> = {
  short_sword: { id: 'short_sword', name: 'Short Sword', glyph: '/', color: '#94b0c2', slot: 'weapon', weight: 3, damage: [1, 6], cooldownMs: 900 },
  dagger: { id: 'dagger', name: 'Dagger', glyph: '\\', color: '#94b0c2', slot: 'weapon', weight: 1, damage: [1, 4], cooldownMs: 600, thrown: true },
  spear: { id: 'spear', name: 'Spear', glyph: '|', color: '#94b0c2', slot: 'weapon', weight: 4, damage: [1, 6], cooldownMs: 1100, reach: true },
  leather_armor: { id: 'leather_armor', name: 'Leather Armor', glyph: ']', color: '#ef7d57', slot: 'armor', weight: 8, ac: 2 },
  wooden_shield: { id: 'wooden_shield', name: 'Wooden Shield', glyph: ')', color: '#ef7d57', slot: 'shield', weight: 5, ac: 1 },
  rations: { id: 'rations', name: 'Rations', glyph: '=', color: '#a7f070', slot: 'misc', weight: 1, food: 20, stackable: true },
  potion_heal: { id: 'potion_heal', name: 'Healing Potion', glyph: '!', color: '#b13e53', slot: 'misc', weight: 1, heal: 12 },
  iron_key: { id: 'iron_key', name: 'Iron Key', glyph: '~', color: '#ffcd75', slot: 'misc', weight: 1, keyId: 'iron' },
  torch: { id: 'torch', name: 'Torch', glyph: 'i', color: '#ffcd75', slot: 'misc', weight: 2 },
  gem: { id: 'gem', name: 'Sapphire', glyph: '*', color: '#41a6f6', slot: 'misc', weight: 1 },
};

export function item(id: string, extra?: Partial<Item>): Item {
  const tpl = ITEMS[id];
  if (!tpl) throw new Error(`unknown item '${id}'`);
  return { tpl, ...extra };
}

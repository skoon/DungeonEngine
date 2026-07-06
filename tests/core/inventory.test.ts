import { describe, expect, it } from 'vitest';
import { makeCharacter, type Character } from '@/core/character';
import { Roster } from '@/core/roster';
import { type InvContext, itemAt, pickUp, placeInto } from '@/core/inventory';
import { item } from '@/data/items';
import type { Item } from '@/core/item';

function ctx(): { c: InvContext; hero: Character } {
  const hero = makeCharacter({ name: 'H', clazz: 'fighter', portrait: 0, stats: { str: 12, dex: 12, con: 12, int: 10, wis: 10 }, hpMax: 10, mpMax: 0 });
  const floor: Item[] = [item('rations')];
  return { c: { roster: new Roster([hero]), floor }, hero };
}

describe('inventory pick-up / place', () => {
  it('picks an item off the floor and drops it into the backpack', () => {
    const { c, hero } = ctx();
    const grabbed = pickUp(c, { kind: 'floor', index: 0 });
    expect(grabbed?.tpl.id).toBe('rations');
    expect(c.floor).toHaveLength(0);
    const displaced = placeInto(c, { kind: 'pack', member: 0, index: 0 }, grabbed!);
    expect(displaced).toBeNull();
    expect(hero.backpack[0]?.tpl.id).toBe('rations');
  });

  it('equips a sword only into a hand, and armour only into the armour slot', () => {
    const { c, hero } = ctx();
    const sword = item('short_sword');
    // Armour slot rejects a sword (returns it unplaced).
    expect(placeInto(c, { kind: 'equip', member: 0, slot: 'armor' }, sword)).toBe(sword);
    expect(hero.equipment.armor ?? null).toBeNull();
    // A hand accepts it.
    expect(placeInto(c, { kind: 'hand', member: 0, index: 0 }, sword)).toBeNull();
    expect(hero.hands[0]?.tpl.id).toBe('short_sword');
  });

  it('placing onto an occupied slot swaps, returning the displaced item', () => {
    const { c, hero } = ctx();
    hero.hands[0] = item('short_sword');
    const displaced = placeInto(c, { kind: 'hand', member: 0, index: 0 }, item('dagger'));
    expect(displaced?.tpl.id).toBe('short_sword');
    expect(hero.hands[0]?.tpl.id).toBe('dagger');
  });

  it('dropping to the floor appends', () => {
    const { c } = ctx();
    placeInto(c, { kind: 'floor', index: 0 }, item('gem'));
    expect(c.floor.map((i) => i.tpl.id)).toEqual(['rations', 'gem']);
  });

  it('itemAt reads without mutating', () => {
    const { c } = ctx();
    expect(itemAt(c, { kind: 'floor', index: 0 })?.tpl.id).toBe('rations');
    expect(c.floor).toHaveLength(1);
  });
});

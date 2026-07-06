import { describe, expect, it } from 'vitest';
import {
  armorClass,
  attackBonus,
  carriedWeight,
  isDisabled,
  makeCharacter,
  statMod,
  weaponDamage,
  type Character,
} from '@/core/character';
import { item } from '@/data/items';

function fighter(): Character {
  return makeCharacter({
    name: 'Test',
    clazz: 'fighter',
    portrait: 0,
    stats: { str: 16, dex: 14, con: 12, int: 10, wis: 10 },
    hpMax: 20,
    mpMax: 0,
    hands: [item('short_sword'), item('wooden_shield')],
    equipment: { armor: item('leather_armor') },
  });
}

describe('character derived stats', () => {
  it('statMod follows the classic table', () => {
    expect(statMod(10)).toBe(0);
    expect(statMod(16)).toBe(3);
    expect(statMod(8)).toBe(-1);
  });

  it('armour class sums dex, worn armour, and a shield in hand', () => {
    // 10 + dexMod(14)=2 + leather(2) + shield(1) = 15
    expect(armorClass(fighter())).toBe(15);
  });

  it('attack bonus uses level and strength', () => {
    expect(attackBonus(fighter())).toBe(1 + 3);
  });

  it('weapon damage reads the equipped hand, else bare fists', () => {
    const c = fighter();
    expect(weaponDamage(c, 0)).toEqual([1, 6]); // short sword
    c.hands[0] = null;
    expect(weaponDamage(c, 0)).toEqual([1, 2]); // fists
  });

  it('carried weight sums hands, equipment and backpack', () => {
    // sword 3 + shield 5 + leather 8 = 16
    expect(carriedWeight(fighter())).toBe(16);
  });

  it('backpack is padded to a fixed size', () => {
    expect(fighter().backpack.length).toBe(14);
  });

  it('is disabled at 0 HP or when unconscious', () => {
    const c = fighter();
    expect(isDisabled(c)).toBe(false);
    c.hp.cur = 0;
    expect(isDisabled(c)).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';
import { makeCharacter, type Character } from '@/core/character';
import { Rng } from '@/core/rng';
import { applyLevelUps, levelForXp, xpToReach } from '@/core/leveling';

function hero(over: Partial<Character> = {}): Character {
  return {
    ...makeCharacter({
      name: 'H', clazz: 'fighter', portrait: 0,
      stats: { str: 14, dex: 12, con: 14, int: 10, wis: 10 },
      hpMax: 20, mpMax: 0, hitDie: 10,
    }),
    ...over,
  };
}

describe('xp curve', () => {
  it('has the expected thresholds', () => {
    expect(xpToReach(1)).toBe(0);
    expect(xpToReach(2)).toBe(100);
    expect(xpToReach(3)).toBe(300);
    expect(xpToReach(5)).toBe(1000);
  });

  it('maps xp totals to levels', () => {
    expect(levelForXp(0)).toBe(1);
    expect(levelForXp(99)).toBe(1);
    expect(levelForXp(100)).toBe(2);
    expect(levelForXp(299)).toBe(2);
    expect(levelForXp(1200)).toBe(5);
  });
});

describe('applyLevelUps', () => {
  it('does nothing below the next threshold', () => {
    const c = hero({ xp: 50 });
    expect(applyLevelUps(c, new Rng(1))).toBe(0);
    expect(c.level).toBe(1);
  });

  it('levels up and grows the HP pool', () => {
    const c = hero({ xp: 100 });
    const hpBefore = c.hp.max;
    const gained = applyLevelUps(c, new Rng(1));
    expect(gained).toBe(1);
    expect(c.level).toBe(2);
    expect(c.hp.max).toBeGreaterThan(hpBefore);
    expect(c.hp.cur).toBe(c.hp.max); // the gain is also added to current HP
  });

  it('can jump multiple levels at once and grows MP for casters', () => {
    const mage = makeCharacter({
      name: 'M', clazz: 'mage', portrait: 2,
      stats: { str: 8, dex: 13, con: 10, int: 16, wis: 11 },
      hpMax: 6, mpMax: 6, hitDie: 4,
    });
    mage.xp = 650; // enough for level 4
    const mpBefore = mage.mp.max;
    const gained = applyLevelUps(mage, new Rng(2));
    expect(gained).toBe(3);
    expect(mage.level).toBe(4);
    expect(mage.mp.max).toBeGreaterThan(mpBefore);
  });
});

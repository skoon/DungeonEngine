import { describe, expect, it } from 'vitest';
import { resolveAttack, rollDamage } from '@/core/combat';
import type { Rng } from '@/core/rng';

/** Minimal Rng stub returning fixed rolls. */
function fake(d20: number, dice = 3): Rng {
  return { int: () => d20, dice: () => dice } as unknown as Rng;
}

describe('resolveAttack', () => {
  it('natural 20 always hits, natural 1 always misses', () => {
    expect(resolveAttack(fake(20), -100, 999).hit).toBe(true);
    expect(resolveAttack(fake(1), 100, 0).hit).toBe(false);
  });

  it('hits when d20 + bonus meets AC', () => {
    expect(resolveAttack(fake(10), 5, 15).hit).toBe(true); // 15 >= 15
    expect(resolveAttack(fake(10), 4, 15).hit).toBe(false); // 14 < 15
  });
});

describe('rollDamage', () => {
  it('adds the flat bonus to the dice', () => {
    expect(rollDamage(fake(0, 4), [1, 6], 2)).toBe(6);
  });

  it('never goes below 1', () => {
    expect(rollDamage(fake(0, 1), [1, 4], -5)).toBe(1);
  });
});

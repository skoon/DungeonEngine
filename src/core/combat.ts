/**
 * Attack resolution (plan §6.1). Pure d20 maths against ascending armour
 * class: roll d20 + attack bonus, hit if it meets the target's AC. Natural 1
 * always misses and natural 20 always hits, the classic way.
 */

import type { Rng } from './rng';

export interface AttackRoll {
  d20: number;
  total: number;
  hit: boolean;
}

export function resolveAttack(rng: Rng, attackBonus: number, targetAc: number): AttackRoll {
  const d20 = rng.int(1, 20);
  const total = d20 + attackBonus;
  const hit = d20 === 20 || (d20 !== 1 && total >= targetAc);
  return { d20, total, hit };
}

/** Weapon dice + flat bonus, floored at 1. */
export function rollDamage(rng: Rng, dice: [number, number], bonus: number): number {
  return Math.max(1, rng.dice(dice[0], dice[1]) + bonus);
}

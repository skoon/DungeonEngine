/**
 * Experience & leveling (plan §3.3/M10). Pure: the XP curve and the effect of
 * gaining a level. The World awards XP and emits events; this module owns the
 * maths so it's testable without a bus.
 *
 * Attack bonus and AC already scale with `level` (see character.ts), so a
 * level-up here also improves accuracy and defence for free — this function
 * only needs to grow the HP/MP pools.
 */

import { type Character, statMod } from './character';
import type { Rng } from './rng';

/** Cumulative XP needed to *reach* a level: L2=100, L3=300, L4=600, L5=1000… */
export function xpToReach(level: number): number {
  return level <= 1 ? 0 : 50 * (level - 1) * level;
}

/** The highest level a given XP total qualifies for. */
export function levelForXp(xp: number): number {
  let level = 1;
  while (xp >= xpToReach(level + 1)) level++;
  return level;
}

/**
 * Advance a character to whatever level their XP now allows, growing HP (and
 * MP for casters) once per level gained. Mutates the character and returns the
 * number of levels gained.
 */
export function applyLevelUps(c: Character, rng: Rng): number {
  const target = levelForXp(c.xp);
  let gained = 0;
  while (c.level < target) {
    c.level += 1;
    gained += 1;
    const hpGain = Math.max(1, rng.int(1, c.hitDie) + statMod(c.stats.con));
    c.hp.max += hpGain;
    c.hp.cur += hpGain;
    if (c.mp.max > 0) {
      const mpGain = 2 + Math.max(0, statMod(Math.max(c.stats.int, c.stats.wis)));
      c.mp.max += mpGain;
      c.mp.cur += mpGain;
    }
  }
  return gained;
}

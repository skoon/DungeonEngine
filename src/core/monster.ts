/**
 * Monsters (plan M6/§4.4). A species is the immutable template; a Monster is
 * a runtime instance with position, HP, an AI state, and per-monster timers
 * so each acts on its own rhythm (move every moveMs, attack every attackMs).
 * The state-transition rule is pure and testable; the World executes moves
 * and attacks.
 */

import type { Dir, Vec2 } from './grid';
import type { Item } from './item';

export type AiKind = 'dumb' | 'smart';
export type MonsterState = 'idle' | 'hunt' | 'attack' | 'flee' | 'dead';

/** A cardinal ranged attack: the monster looses a bolt down a clear line of
 * sight when it can see the party but isn't adjacent (plan M13). */
export interface RangedSpec {
  damage: [number, number];
  /** Maximum cells the bolt travels. */
  range: number;
  /** Bolt hop cadence, ms (defaults to the projectile system's default). */
  hopMs?: number;
  glyph?: string;
  color?: string;
  /** Name used in combat log lines ("...a chill bolt!"). */
  label?: string;
}

/** A boss phase, triggered once the monster's HP drops to `atHpFrac` of max
 * (plan M13). Phases are declared high→low and fire in order, at most once. */
export interface PhaseSpec {
  atHpFrac: number;
  /** Summon reinforcements (placed safely near the party). */
  summon?: { species: MonsterSpecies; count: number };
  /** Multiply the boss's move/attack timers — <1 enrages (faster). */
  speedMult?: number;
}

export interface MonsterSpecies {
  id: string;
  name: string;
  glyph: string;
  color: string;
  maxHp: number;
  ac: number;
  attackBonus: number;
  damage: [number, number];
  /** Per-monster timers, milliseconds. */
  moveMs: number;
  attackMs: number;
  /** Detection radius in cells. */
  sight: number;
  xp: number;
  ai: AiKind;
  /** Coin dropped on death, rolled uniformly in [min, max] (plan M-DR2). */
  gold?: [number, number];
  /** Smart monsters flee below this fraction of max HP. */
  fleeBelow?: number;
  /** Chance (0..1) a successful hit also poisons the target (plan M13). */
  poison?: number;
  /** Cardinal ranged attack (plan M13). */
  ranged?: RangedSpec;
  /** Boss phase behaviors, declared high→low HP fraction (plan M13). */
  phases?: PhaseSpec[];
  /** Loot dropped on death. */
  loot?: () => Item[];
  /**
   * Atlas sprite family (`<key>_<pose>_walk_tier<row>` frames). Species
   * without one keep the procedural billboard (sprite plan P3).
   */
  spriteKey?: string;
}

export interface Monster {
  species: MonsterSpecies;
  pos: Vec2;
  facing: Dir;
  hp: { cur: number; max: number };
  state: MonsterState;
  moveTimer: number;
  attackTimer: number;
  /** Hurt-flash timer, ms. */
  flash: number;
  /** Timer multiplier from enrage phases; 1 by default (plan M13). */
  speedMult: number;
  /** How many boss phases have fired so far (plan M13). */
  phasesFired: number;
}

export interface MonsterSpawn {
  pos: Vec2;
  facing: Dir;
  species: MonsterSpecies;
}

export function spawnMonster(spawn: MonsterSpawn): Monster {
  const sp = spawn.species;
  return {
    species: sp,
    pos: { ...spawn.pos },
    facing: spawn.facing,
    hp: { cur: sp.maxHp, max: sp.maxHp },
    state: 'idle',
    moveTimer: sp.moveMs,
    attackTimer: sp.attackMs,
    flash: 0,
    speedMult: 1,
    phasesFired: 0,
  };
}

export interface Perception {
  adjacent: boolean;
  canSee: boolean;
}

/** Pure AI state transition given what the monster perceives this tick. */
export function decideState(m: Monster, p: Perception): MonsterState {
  if (m.hp.cur <= 0) return 'dead';
  const flee = m.species.fleeBelow ?? 0;
  if (m.species.ai === 'smart' && flee > 0 && m.hp.cur <= m.species.maxHp * flee) {
    return 'flee';
  }
  if (p.adjacent) return 'attack';
  if (m.state === 'idle') return p.canSee ? 'hunt' : 'idle';
  return 'hunt';
}

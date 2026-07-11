/**
 * Monster registry (plan M6). Two starter species: a dumb skeleton that
 * marches straight in, and a kobold that flees when badly hurt.
 */

import type { MonsterSpecies } from '../core/monster';
import { item } from './items';

export const SKELETON: MonsterSpecies = {
  id: 'skeleton',
  name: 'Skeleton',
  glyph: 'S',
  color: '#f4f4f4',
  maxHp: 10,
  ac: 12,
  attackBonus: 2,
  damage: [1, 6],
  moveMs: 900,
  attackMs: 1800,
  sight: 8,
  xp: 12,
  ai: 'dumb',
  gold: [2, 8],
};

export const KOBOLD: MonsterSpecies = {
  id: 'kobold',
  name: 'Kobold',
  glyph: 'k',
  color: '#a7f070',
  maxHp: 6,
  ac: 13,
  attackBonus: 1,
  damage: [1, 4],
  moveMs: 650,
  attackMs: 1500,
  sight: 7,
  xp: 8,
  ai: 'smart',
  fleeBelow: 0.34,
  gold: [3, 12],
  loot: () => [item('dagger')],
};

export const GIANT_RAT: MonsterSpecies = {
  id: 'giant_rat',
  name: 'Giant Rat',
  glyph: 'r',
  color: '#94b0c2',
  maxHp: 4,
  ac: 12,
  attackBonus: 1,
  damage: [1, 3],
  moveMs: 450, // quick and skittering
  attackMs: 1100,
  sight: 6,
  xp: 4,
  ai: 'dumb',
  gold: [0, 3],
};

export const CAVE_SPIDER: MonsterSpecies = {
  id: 'cave_spider',
  name: 'Cave Spider',
  glyph: 'x',
  color: '#5d275d',
  maxHp: 7,
  ac: 14, // nimble, hard to hit
  attackBonus: 3,
  damage: [1, 4],
  moveMs: 550,
  attackMs: 1200,
  sight: 7,
  xp: 10,
  ai: 'smart',
  fleeBelow: 0.25,
  gold: [4, 10],
  poison: 0.5, // half its bites leave venom that chips HP between fights (M13)
};

export const ZOMBIE: MonsterSpecies = {
  id: 'zombie',
  name: 'Zombie',
  glyph: 'z',
  color: '#38b764',
  maxHp: 18, // slow but tough and heavy-hitting
  ac: 9,
  attackBonus: 3,
  damage: [1, 8],
  moveMs: 1400,
  attackMs: 2200,
  sight: 6,
  xp: 16,
  ai: 'dumb',
  gold: [5, 15],
};

export const WRAITH: MonsterSpecies = {
  id: 'wraith',
  name: 'Wraith',
  glyph: 'W',
  color: '#73eff7',
  maxHp: 12,
  ac: 15,
  attackBonus: 4,
  damage: [1, 6],
  moveMs: 700,
  attackMs: 1600,
  sight: 9,
  xp: 22,
  ai: 'smart',
  fleeBelow: 0.2,
  gold: [10, 25],
  // Snipes down corridors with a chill bolt when it has a clear line (M13).
  ranged: { damage: [1, 6], range: 6, glyph: '*', color: '#73eff7', label: 'chill bolt' },
};

export const BONE_LORD: MonsterSpecies = {
  id: 'bone_lord',
  name: 'Bone Lord',
  glyph: 'B',
  color: '#ffcd75',
  maxHp: 44, // the crypt's boss
  ac: 16,
  attackBonus: 5,
  damage: [2, 6],
  moveMs: 800,
  attackMs: 1700,
  sight: 10,
  xp: 120,
  ai: 'dumb', // relentless — never flees
  gold: [80, 160],
  // At half health it raises two skeletons and enrages (faster attacks) — a
  // setpiece turn instead of a stat check (plan M13).
  phases: [{ atHpFrac: 0.5, summon: { species: SKELETON, count: 2 }, speedMult: 0.9 }],
  loot: () => [item('short_sword'), item('potion_heal'), item('gem')],
};

export const MONSTERS: Record<string, MonsterSpecies> = {
  skeleton: SKELETON,
  kobold: KOBOLD,
  giant_rat: GIANT_RAT,
  cave_spider: CAVE_SPIDER,
  zombie: ZOMBIE,
  wraith: WRAITH,
  bone_lord: BONE_LORD,
};

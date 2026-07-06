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
  loot: () => [item('dagger')],
};

export const MONSTERS: Record<string, MonsterSpecies> = {
  skeleton: SKELETON,
  kobold: KOBOLD,
};

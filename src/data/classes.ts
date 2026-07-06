/**
 * Class definitions (plan §3.3). Content data — a future classes.json slots
 * in here unchanged.
 */

import type { Clazz, Stats } from '../core/character';

export interface ClassDef {
  name: string;
  stats: Stats;
  hitDie: number;
  caster: boolean;
}

export const CLASSES: Record<Clazz, ClassDef> = {
  fighter: { name: 'Fighter', stats: { str: 16, dex: 12, con: 14, int: 9, wis: 10 }, hitDie: 10, caster: false },
  cleric: { name: 'Cleric', stats: { str: 13, dex: 10, con: 13, int: 10, wis: 15 }, hitDie: 8, caster: true },
  mage: { name: 'Mage', stats: { str: 8, dex: 13, con: 10, int: 16, wis: 11 }, hitDie: 4, caster: true },
  thief: { name: 'Thief', stats: { str: 11, dex: 16, con: 11, int: 12, wis: 10 }, hitDie: 6, caster: false },
};

/**
 * Cell-traveling projectiles (plan §6.2/§7): thrown weapons, spell bolts,
 * and (generically) monster-fired shots. A projectile hops one cell at a
 * time along `dir`; World.tick advances it and resolves hits. Thrown items
 * carry their source Item so they land on the floor and can be retrieved —
 * the classic "darts economy" (plan §6.2).
 */

import type { Dir, Vec2 } from './grid';
import type { Item } from './item';

export type ProjectileSource = 'party' | 'monster';

export interface Projectile {
  pos: Vec2;
  dir: Dir;
  from: ProjectileSource;
  attackBonus: number;
  damage: [number, number];
  damageBonus: number;
  /** Spell bolts (e.g. Magic Missile) don't miss. */
  guaranteed?: boolean;
  /** Present for thrown weapons: dropped on the floor wherever it lands. */
  item?: Item;
  glyph: string;
  color: string;
  /** Name used in combat log lines ("The dagger hits..."). */
  label: string;
  hopMs: number;
  timer: number;
  /** Cells remaining before it fizzles/falls, decremented per hop. */
  range: number;
}

export interface ProjectileSpawn {
  pos: Vec2;
  dir: Dir;
  from: ProjectileSource;
  attackBonus: number;
  damage: [number, number];
  damageBonus: number;
  guaranteed?: boolean;
  item?: Item;
  glyph: string;
  color: string;
  label: string;
  hopMs?: number;
  range?: number;
}

export function spawnProjectile(s: ProjectileSpawn): Projectile {
  return {
    pos: { ...s.pos },
    dir: s.dir,
    from: s.from,
    attackBonus: s.attackBonus,
    damage: s.damage,
    damageBonus: s.damageBonus,
    glyph: s.glyph,
    color: s.color,
    label: s.label,
    hopMs: s.hopMs ?? 70,
    timer: s.hopMs ?? 70,
    range: s.range ?? 8,
    ...(s.guaranteed !== undefined ? { guaranteed: s.guaranteed } : {}),
    ...(s.item !== undefined ? { item: s.item } : {}),
  };
}

/**
 * Frame-name resolution for the sprite atlases (sprite plan §2 naming).
 * Pure string/geometry logic, split from the browser loader so the mapping
 * rules are unit-testable in node.
 */

import type { Dir } from '../core/grid';

/** Art names that differ from item template ids (concept-era aliases). */
const ITEM_FRAME_ALIAS: Record<string, string> = {
  short_sword: 'item_sword',
  rations: 'item_bundle_of_food',
  gem: 'item_jewels',
  leather_armor: 'item_armor',
};

/** Atlas frame name for an item template id. */
export function itemFrame(tplId: string): string {
  return ITEM_FRAME_ALIAS[tplId] ?? `item_${tplId}`;
}

/**
 * Atlas frame name for a projectile at a depth row, derived from its combat
 * label ("Dagger" → projectile_dagger_tier2). Labels are the only stable
 * identity projectiles carry; slugging keeps the mapping data-free.
 */
export function projectileFrame(label: string, row: number): string {
  const slug = label.toLowerCase().trim().replace(/\s+/g, '_');
  return `projectile_${slug}_tier${row}`;
}

/** The 16 portrait frames, indexed by `Character.portrait` (mod 16). */
export const PORTRAIT_FRAMES: readonly string[] = (['human', 'elf', 'dwarf', 'halfling'] as const).flatMap(
  (race) => (['m', 'f'] as const).flatMap((sex) => (['young', 'old'] as const).map((age) => `portrait_${race}_${sex}_${age}`)),
);

export function portraitFrame(index: number): string {
  const n = PORTRAIT_FRAMES.length;
  return PORTRAIT_FRAMES[((index % n) + n) % n]!;
}

export type MonsterPose = 'front' | 'side' | 'back';

export interface PoseView {
  pose: MonsterPose;
  /** Side sprites are authored facing the viewer's right; mirror for left. */
  mirror: boolean;
}

/**
 * Which authored pose a monster shows given its facing and the party's.
 * Same facing as the viewer = we see its back; opposite = its front.
 */
export function monsterPose(monsterFacing: Dir, viewFacing: Dir): PoseView {
  const rel = (monsterFacing - viewFacing + 4) % 4;
  switch (rel) {
    case 0:
      return { pose: 'back', mirror: false };
    case 1:
      return { pose: 'side', mirror: false };
    case 2:
      return { pose: 'front', mirror: false };
    default:
      return { pose: 'side', mirror: true };
  }
}

/** Atlas frame name for a monster pose at a depth row (tier = row). */
export function monsterFrame(spriteKey: string, pose: MonsterPose, row: number): string {
  return `${spriteKey}_${pose}_walk_tier${row}`;
}

/** Wall face frame names, per tileset and depth row. */
export function wallFrontFrame(tileset: string, row: number): string {
  return `${tileset}_front_${row}`;
}

export function wallSideFrame(tileset: string, row: number): string {
  return `${tileset}_side_${row}`;
}

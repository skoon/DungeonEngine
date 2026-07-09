/**
 * Spell definitions (plan §6.3). A Character holds resolved SpellDef objects
 * directly — mirroring how it holds Item instances rather than item ids —
 * so core stays data-agnostic; data/spells.ts + data/party.ts assign them.
 */

export type SpellKind = 'projectile' | 'cone' | 'buff' | 'heal' | 'light' | 'detect' | 'townPortal';

export interface SpellDef {
  id: string;
  name: string;
  mpCost: number;
  /** Cast time in ms; doubles as the per-caster cooldown before recasting. */
  castMs: number;
  kind: SpellKind;
  glyph?: string;
  color?: string;
  /** projectile / cone damage dice. */
  damage?: [number, number];
  /** buff */
  acBonus?: number;
  buffMs?: number;
  /** heal */
  healDice?: [number, number];
  /** light */
  lightMs?: number;
  /** detect */
  detectRadius?: number;
}

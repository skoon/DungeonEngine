/**
 * Spellbook overlay (plan §6.3). A simple vertical list of every known
 * (caster, spell) pair — no full mouse/radial picker yet (that's M8's
 * pattern to extend once click-to-target exists). Arrow keys move the
 * cursor, Enter casts and closes, Esc cancels. The sim is paused while open,
 * matching the inventory overlay.
 */

import type { Character } from '../core/character';
import type { Roster } from '../core/roster';
import { COLORS, SWEETIE16 } from './palette';
import { NATIVE_HEIGHT, NATIVE_WIDTH } from './screen';
import { text } from './text';

export interface SpellEntry {
  member: number;
  spellId: string;
  caster: Character;
}

const ROW_H = 12;
const TOP = 30;

/** Flat list of every spell every party member knows, member-major order. */
export function buildSpellEntries(roster: Roster): SpellEntry[] {
  const out: SpellEntry[] = [];
  roster.members.forEach((c, member) => {
    for (const def of c.spells) out.push({ member, spellId: def.id, caster: c });
  });
  return out;
}

export function drawSpellbook(
  ctx: CanvasRenderingContext2D,
  entries: SpellEntry[],
  cursor: number,
): void {
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, NATIVE_WIDTH, NATIVE_HEIGHT);
  text(ctx, 'SPELLBOOK', 8, 6, COLORS.title);
  text(ctx, 'up/down select  Enter cast  C/Esc close', 90, 6, COLORS.textDim);

  if (entries.length === 0) {
    text(ctx, 'No one knows any spells.', 8, TOP, COLORS.textDim);
    return;
  }

  entries.forEach((e, i) => {
    const def = e.caster.spells.find((s) => s.id === e.spellId);
    if (!def) return;
    const y = TOP + i * ROW_H;
    const canAfford = e.caster.mp.cur >= def.mpCost && e.caster.spellCooldown <= 0;
    const color = i === cursor ? COLORS.title : canAfford ? COLORS.text : COLORS.textDim;
    if (i === cursor) {
      ctx.fillStyle = SWEETIE16.ink;
      ctx.fillRect(4, y - 1, NATIVE_WIDTH - 8, ROW_H);
    }
    text(ctx, `${e.caster.name.padEnd(8)} ${def.name.padEnd(16)} ${def.mpCost}mp`, 8, y, color);
  });
}

export function navigateList(length: number, cursor: number, delta: number): number {
  if (length === 0) return 0;
  return (cursor + delta + length) % length;
}

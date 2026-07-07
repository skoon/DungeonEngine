/**
 * Inventory overlay (plan §2.2/§5). Classic crawler flow: grab an item onto
 * the cursor, move, place. Renders four character sheets (hands, equipment,
 * backpack) plus a shared GROUND row (the party's current cell floor). The
 * simulation is paused while this is open; the UI state (cursor, held item)
 * lives in main, this module just builds the slot layout, draws it, and
 * navigates.
 */

import { EQUIP_SLOTS, type Character } from '../core/character';
import type { Item } from '../core/item';
import type { Roster } from '../core/roster';
import type { InvContext, SlotRef } from '../core/inventory';
import { itemAt } from '../core/inventory';
import { COLORS, SWEETIE16 } from './palette';
import { NATIVE_HEIGHT, NATIVE_WIDTH } from './screen';
import { contains } from './layout';
import { drawCloseButton } from './controls';
import { drawItemIcon, drawSlotBox } from './itemIcon';
import { text } from './text';

const GROUND_SLOTS = 8;
const S = 16; // slot size

export interface Placement {
  ref: SlotRef;
  x: number;
  y: number;
  label?: string;
}

/** Build the slot layout; order is irrelevant since nav is geometric. */
export function buildPlacements(roster: Roster): Placement[] {
  const out: Placement[] = [];
  roster.members.forEach((_, m) => {
    const colX = 8 + m * 156;
    // hands
    out.push({ ref: { kind: 'hand', member: m, index: 0 }, x: colX, y: 44, label: 'L' });
    out.push({ ref: { kind: 'hand', member: m, index: 1 }, x: colX + 20, y: 44, label: 'R' });
    // equipment
    EQUIP_SLOTS.forEach((slot, i) => {
      out.push({ ref: { kind: 'equip', member: m, slot }, x: colX + i * 20, y: 68, label: slot.charAt(0).toUpperCase() });
    });
    // backpack 2 x 7
    for (let i = 0; i < 14; i++) {
      out.push({ ref: { kind: 'pack', member: m, index: i }, x: colX + (i % 2) * 20, y: 96 + Math.floor(i / 2) * 20 });
    }
  });
  // shared ground row
  for (let i = 0; i < GROUND_SLOTS; i++) {
    out.push({ ref: { kind: 'floor', index: i }, x: 8 + i * 20, y: NATIVE_HEIGHT - 28 });
  }
  return out;
}

export function drawInventory(
  ctx: CanvasRenderingContext2D,
  ctxInv: InvContext,
  placements: Placement[],
  cursor: number,
  held: Item | null,
  mouse?: { x: number; y: number } | null,
): void {
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, NATIVE_WIDTH, NATIVE_HEIGHT);
  text(ctx, 'INVENTORY', 8, 6, COLORS.title);
  text(ctx, 'click / arrows+Enter to move items   I / Esc / X to close', 90, 6, COLORS.textDim);
  drawCloseButton(ctx);

  ctxInv.roster.members.forEach((c, m) => {
    header(ctx, 8 + m * 156, c);
  });
  text(ctx, 'GROUND', 8, NATIVE_HEIGHT - 40, COLORS.title);

  placements.forEach((p, i) => {
    drawSlotBox(ctx, p.x, p.y, S, i === cursor);
    const it = itemAt(ctxInv, p.ref);
    if (it) drawItemIcon(ctx, it, p.x, p.y, S);
    else if (p.label) text(ctx, p.label, p.x + 5, p.y + 4, COLORS.textDim);
  });

  // Held item rides the cursor (mouse position if we have it, else a fixed
  // dock under the title so it stays visible for keyboard-only play).
  if (held) {
    if (mouse) {
      drawItemIcon(ctx, held, mouse.x - S / 2, mouse.y - S / 2, S);
    } else {
      text(ctx, 'holding:', 8, 20, COLORS.text);
      drawItemIcon(ctx, held, 52, 16, S);
      text(ctx, held.tpl.name, 72, 20, held.tpl.color);
    }
  }
}

/** Index of the placement whose slot the point falls in, or -1. */
export function hitPlacement(placements: Placement[], x: number, y: number): number {
  return placements.findIndex((p) => contains({ x: p.x, y: p.y, w: S, h: S }, x, y));
}

function header(ctx: CanvasRenderingContext2D, x: number, c: Character): void {
  text(ctx, c.name, x, 34, SWEETIE16.white);
}

/** Nearest placement in a cardinal direction, or the current one. */
export function navigate(placements: Placement[], cursor: number, dir: 'up' | 'down' | 'left' | 'right'): number {
  const cur = placements[cursor];
  if (!cur) return cursor;
  let best = cursor;
  let bestScore = Infinity;
  placements.forEach((p, i) => {
    if (i === cursor) return;
    const dx = p.x - cur.x;
    const dy = p.y - cur.y;
    const forward = dir === 'left' ? -dx : dir === 'right' ? dx : dir === 'up' ? -dy : dy;
    if (forward <= 0) return; // not in the chosen direction
    const lateral = dir === 'up' || dir === 'down' ? Math.abs(dx) : Math.abs(dy);
    const score = forward + lateral * 3; // prefer aligned, then nearest
    if (score < bestScore) {
      bestScore = score;
      best = i;
    }
  });
  return best;
}

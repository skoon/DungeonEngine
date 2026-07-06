/**
 * Programmer-art item icon: a bordered slot with the item's glyph in its
 * colour. Shared by the party panel, inventory overlay, and viewport floor
 * items until a real icon sheet exists.
 */

import type { Item } from '../core/item';
import { COLORS } from './palette';
import { text } from './text';

export function drawSlotBox(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  highlight = false,
): void {
  ctx.fillStyle = COLORS.slotBg;
  ctx.fillRect(x, y, size, size);
  ctx.strokeStyle = highlight ? COLORS.title : COLORS.slotBorder;
  ctx.strokeRect(x + 0.5, y + 0.5, size - 1, size - 1);
}

export function drawItemIcon(
  ctx: CanvasRenderingContext2D,
  item: Item,
  x: number,
  y: number,
  size: number,
): void {
  const cx = x + Math.floor((size - 4) / 2);
  const cy = y + Math.floor((size - 8) / 2);
  text(ctx, item.tpl.glyph.slice(0, 1), cx, cy, item.tpl.color);
  if ((item.count ?? 1) > 1) {
    text(ctx, String(item.count), x + size - 8, y + size - 8, COLORS.textDim);
  }
}

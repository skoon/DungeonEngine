/**
 * On-screen controls (plan M8): the movement pad, the bag/spellbook header
 * buttons, and overlay close boxes. Geometry lives in layout.ts so hit-test
 * and drawing share one source of truth; this module just paints them.
 */

import { CLOSE_BUTTON, MOVE_BUTTONS, UI_BUTTONS, type Rect } from './layout';
import { COLORS, SWEETIE16 } from './palette';
import { text } from './text';

function button(ctx: CanvasRenderingContext2D, r: Rect, label: string, active = false): void {
  ctx.fillStyle = active ? COLORS.frameFace : 'rgba(26,28,44,0.72)';
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.strokeStyle = COLORS.frameHi;
  ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
  const tx = r.x + Math.max(2, (r.w - label.length * 6) / 2);
  const ty = r.y + Math.max(1, (r.h - 8) / 2);
  text(ctx, label, tx, ty, active ? SWEETIE16.yellow : COLORS.text);
}

export function drawMovePad(ctx: CanvasRenderingContext2D): void {
  for (const b of MOVE_BUTTONS) button(ctx, b.rect, b.label);
}

export function drawHeaderButtons(ctx: CanvasRenderingContext2D): void {
  for (const b of UI_BUTTONS) button(ctx, b.rect, b.label);
}

export function drawCloseButton(ctx: CanvasRenderingContext2D): void {
  button(ctx, CLOSE_BUTTON, 'X');
}

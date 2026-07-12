/**
 * Victory screen (plan M14). Shown when the Amulet of Dawn reaches the
 * dawn-sealed gates (`game/won`). Offers to keep exploring the barrows with
 * the winning party, or return to the title. Keyboard (up/down + Enter) and
 * mouse both work, like the game-over screen.
 */

import { COLORS, SWEETIE16 } from './palette';
import { NATIVE_HEIGHT, NATIVE_WIDTH } from './screen';
import { contains, type Rect } from './layout';
import { text } from './text';

export type VictoryId = 'continue' | 'title';
export interface VictoryItem {
  id: VictoryId;
  label: string;
  rect: Rect;
  enabled: boolean;
}

export function buildVictoryItems(): VictoryItem[] {
  const w = 180;
  const x = Math.round((NATIVE_WIDTH - w) / 2);
  return [
    { id: 'continue', label: 'Continue Exploring', rect: { x, y: 216, w, h: 18 }, enabled: true },
    { id: 'title', label: 'Return to Title', rect: { x, y: 242, w, h: 18 }, enabled: true },
  ];
}

export function drawVictory(ctx: CanvasRenderingContext2D, items: VictoryItem[], cursor: number): void {
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, NATIVE_WIDTH, NATIVE_HEIGHT);

  ctx.strokeStyle = SWEETIE16.yellow;
  ctx.strokeRect(20.5, 20.5, NATIVE_WIDTH - 41, NATIVE_HEIGHT - 41);

  ctx.textBaseline = 'top';
  ctx.fillStyle = SWEETIE16.yellow;
  ctx.font = 'bold 26px monospace';
  centre(ctx, 'THE DAWN RETURNS', 100);
  ctx.font = '10px monospace';
  ctx.fillStyle = COLORS.textDim;
  centre(ctx, 'the amulet is home — the dead may rest', 136);

  items.forEach((it, i) => {
    const on = i === cursor;
    ctx.fillStyle = on ? COLORS.frameFace : 'rgba(26,28,44,0.6)';
    ctx.fillRect(it.rect.x, it.rect.y, it.rect.w, it.rect.h);
    ctx.strokeStyle = on ? SWEETIE16.yellow : COLORS.frameHi;
    ctx.strokeRect(it.rect.x + 0.5, it.rect.y + 0.5, it.rect.w - 1, it.rect.h - 1);
    const color = on ? SWEETIE16.yellow : COLORS.text;
    text(ctx, it.label, it.rect.x + Math.round((it.rect.w - it.label.length * 6) / 2), it.rect.y + 5, color);
  });

  ctx.font = '8px monospace';
  ctx.fillStyle = COLORS.textDim;
  centre(ctx, 'arrows + Enter, or click', NATIVE_HEIGHT - 40);
}

/** Index of the item under a point, or -1. */
export function hitVictory(items: VictoryItem[], x: number, y: number): number {
  return items.findIndex((it) => it.enabled && contains(it.rect, x, y));
}

function centre(ctx: CanvasRenderingContext2D, str: string, y: number): void {
  const w = ctx.measureText(str).width;
  ctx.fillText(str, Math.round((NATIVE_WIDTH - w) / 2), y);
}

/**
 * Game-over screen (plan M11). Shown when the whole party falls
 * (`party/wiped`). Offers to reload the last save, or return to the title.
 * Keyboard (up/down + Enter) and mouse both work, like the title screen.
 */

import { COLORS, SWEETIE16 } from './palette';
import { NATIVE_HEIGHT, NATIVE_WIDTH } from './screen';
import { contains, type Rect } from './layout';
import { text } from './text';

export type GameOverId = 'load' | 'title';
export interface GameOverItem {
  id: GameOverId;
  label: string;
  rect: Rect;
  enabled: boolean;
}

export function buildGameOverItems(canLoad: boolean): GameOverItem[] {
  const w = 180;
  const x = Math.round((NATIVE_WIDTH - w) / 2);
  return [
    { id: 'load', label: 'Load Last Save', rect: { x, y: 216, w, h: 18 }, enabled: canLoad },
    { id: 'title', label: 'Return to Title', rect: { x, y: 242, w, h: 18 }, enabled: true },
  ];
}

export function drawGameOver(ctx: CanvasRenderingContext2D, items: GameOverItem[], cursor: number): void {
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, NATIVE_WIDTH, NATIVE_HEIGHT);

  ctx.strokeStyle = SWEETIE16.red;
  ctx.strokeRect(20.5, 20.5, NATIVE_WIDTH - 41, NATIVE_HEIGHT - 41);

  ctx.textBaseline = 'top';
  ctx.fillStyle = SWEETIE16.red;
  ctx.font = 'bold 26px monospace';
  centre(ctx, 'THE PARTY HAS FALLEN', 100);
  ctx.font = '10px monospace';
  ctx.fillStyle = COLORS.textDim;
  centre(ctx, 'the barrow keeps its dead', 136);

  items.forEach((it, i) => {
    const on = i === cursor;
    ctx.fillStyle = on ? COLORS.frameFace : 'rgba(26,28,44,0.6)';
    ctx.fillRect(it.rect.x, it.rect.y, it.rect.w, it.rect.h);
    ctx.strokeStyle = on ? SWEETIE16.yellow : COLORS.frameHi;
    ctx.strokeRect(it.rect.x + 0.5, it.rect.y + 0.5, it.rect.w - 1, it.rect.h - 1);
    const color = !it.enabled ? SWEETIE16.slate : on ? SWEETIE16.yellow : COLORS.text;
    text(ctx, it.label, it.rect.x + Math.round((it.rect.w - it.label.length * 6) / 2), it.rect.y + 5, color);
  });

  ctx.font = '8px monospace';
  ctx.fillStyle = COLORS.textDim;
  centre(ctx, 'arrows + Enter, or click', NATIVE_HEIGHT - 40);
}

/** Index of the enabled item under a point, or -1. */
export function hitGameOver(items: GameOverItem[], x: number, y: number): number {
  return items.findIndex((it) => it.enabled && contains(it.rect, x, y));
}

function centre(ctx: CanvasRenderingContext2D, str: string, y: number): void {
  const w = ctx.measureText(str).width;
  ctx.fillText(str, Math.round((NATIVE_WIDTH - w) / 2), y);
}

/**
 * Title screen (plan M10). A framed menu shown before play begins: New Game,
 * and Continue when a save exists. Keyboard (up/down + Enter) and mouse both
 * work, matching the rest of the UI.
 */

import { COLORS, SWEETIE16 } from './palette';
import { NATIVE_HEIGHT, NATIVE_WIDTH } from './screen';
import { contains, type Rect } from './layout';
import { text } from './text';

export type TitleId = 'new' | 'continue';
export interface TitleItem {
  id: TitleId;
  label: string;
  rect: Rect;
  enabled: boolean;
}

export function buildTitleItems(canContinue: boolean): TitleItem[] {
  const w = 140;
  const x = Math.round((NATIVE_WIDTH - w) / 2);
  return [
    { id: 'new', label: 'New Game', rect: { x, y: 210, w, h: 18 }, enabled: true },
    { id: 'continue', label: 'Continue', rect: { x, y: 236, w, h: 18 }, enabled: canContinue },
  ];
}

export function drawTitle(ctx: CanvasRenderingContext2D, items: TitleItem[], cursor: number): void {
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, NATIVE_WIDTH, NATIVE_HEIGHT);

  // Frame.
  ctx.strokeStyle = SWEETIE16.slate;
  ctx.strokeRect(20.5, 20.5, NATIVE_WIDTH - 41, NATIVE_HEIGHT - 41);

  // Big title (bypass the 8px helper for a larger face).
  ctx.textBaseline = 'top';
  ctx.fillStyle = SWEETIE16.yellow;
  ctx.font = 'bold 28px monospace';
  centre(ctx, 'DUNGEON ENGINE', 96);
  ctx.font = '10px monospace';
  ctx.fillStyle = COLORS.textDim;
  centre(ctx, 'a first-person barrow crawl', 132);

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
  centre(ctx, 'arrows + Enter, or click.   N toggles sound', NATIVE_HEIGHT - 40);
}

/** Index of the enabled item under a point, or -1. */
export function hitTitle(items: TitleItem[], x: number, y: number): number {
  return items.findIndex((it) => it.enabled && contains(it.rect, x, y));
}

function centre(ctx: CanvasRenderingContext2D, str: string, y: number): void {
  const w = ctx.measureText(str).width;
  ctx.fillText(str, Math.round((NATIVE_WIDTH - w) / 2), y);
}

/**
 * Pane chrome — the stone frames around the three panes. Drawn
 * programmatically (a raised bevel with a sunken content well) as
 * placeholder chrome; a nine-slice sprite sheet replaces this look in the
 * art pass (plan §2.4). The content-well geometry it produces is what the
 * panel drawers render inside.
 */

import { COLORS } from './palette';
import { LOG, PARTY, VIEWPORT, type Rect } from './layout';
import { sprites } from './sprites';
import { text } from './text';

const BORDER = 3;

function panelFrame(ctx: CanvasRenderingContext2D, r: Rect): void {
  // 9-slice sprite chrome when loaded; the content well is always filled
  // flat so panel drawers render on a predictable background.
  if (sprites.drawNineSlice(ctx, 'ui_chrome_frame', r.x, r.y, r.w, r.h)) {
    ctx.fillStyle = COLORS.contentBg;
    ctx.fillRect(r.x + BORDER, r.y + BORDER, r.w - 2 * BORDER, r.h - 2 * BORDER);
    return;
  }

  // Border base.
  ctx.fillStyle = COLORS.frameFace;
  ctx.fillRect(r.x, r.y, r.w, r.h);

  // Raised bevel: light top/left, dark bottom/right.
  ctx.fillStyle = COLORS.frameHi;
  ctx.fillRect(r.x, r.y, r.w, 1);
  ctx.fillRect(r.x, r.y, 1, r.h);
  ctx.fillStyle = COLORS.frameLo;
  ctx.fillRect(r.x, r.y + r.h - 1, r.w, 1);
  ctx.fillRect(r.x + r.w - 1, r.y, 1, r.h);

  // Sunken content well.
  const cx = r.x + BORDER;
  const cy = r.y + BORDER;
  const cw = r.w - 2 * BORDER;
  const ch = r.h - 2 * BORDER;
  ctx.fillStyle = COLORS.frameLo;
  ctx.fillRect(cx - 1, cy - 1, cw + 2, ch + 2);
  ctx.fillStyle = COLORS.contentBg;
  ctx.fillRect(cx, cy, cw, ch);
}

export function drawChrome(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, VIEWPORT.w + PARTY.w, PARTY.h);

  for (const [pane, title] of [
    [VIEWPORT, 'MAP'],
    [LOG, 'MESSAGES'],
    [PARTY, 'PARTY'],
  ] as const) {
    panelFrame(ctx, pane);
    text(ctx, title, pane.x + 6, pane.y + 5, COLORS.title);
  }
}

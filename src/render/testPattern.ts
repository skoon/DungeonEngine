/**
 * M0 test pattern. Proves, at a glance:
 *  - integer scaling is crisp (1px checkerboard shows no moiré/blur)
 *  - nothing is cropped (1px border at the extreme edges)
 *  - the three-pane layout coordinates from the plan (§2)
 *  - the sim loop runs at 10 ticks/s (counter + pixel that steps per tick)
 *  - the seeded RNG is deterministic (star field identical on every load)
 *
 * Throwaway file: replaced by the real panes in M2.
 */

import { NATIVE_WIDTH, NATIVE_HEIGHT } from './screen';
import { Rng } from '../core/rng';

// Pane rects from the implementation plan, §2.
export const VIEWPORT = { x: 0, y: 0, w: 440, h: 290 };
export const LOG = { x: 0, y: 290, w: 440, h: 110 };
export const PARTY = { x: 440, y: 0, w: 200, h: 400 };

const PALETTE = [
  '#1a1c2c', '#5d275d', '#b13e53', '#ef7d57',
  '#ffcd75', '#a7f070', '#38b764', '#257179',
  '#29366f', '#3b5dc9', '#41a6f6', '#73eff7',
  '#f4f4f4', '#94b0c2', '#566c86', '#333c57',
];

const stars = buildStars();

function buildStars(): { x: number; y: number; color: string }[] {
  // Fixed seed on purpose: the field must look identical every load.
  const rng = new Rng(0xd00d);
  const out = [];
  for (let i = 0; i < 120; i++) {
    out.push({
      x: rng.int(VIEWPORT.x + 4, VIEWPORT.x + VIEWPORT.w - 5),
      y: rng.int(VIEWPORT.y + 16, VIEWPORT.y + VIEWPORT.h - 24),
      color: rng.pick(['#f4f4f4', '#94b0c2', '#566c86', '#ffcd75']),
    });
  }
  return out;
}

export function drawTestPattern(
  ctx: CanvasRenderingContext2D,
  tick: number,
  scale: number,
): void {
  ctx.fillStyle = '#1a1c2c';
  ctx.fillRect(0, 0, NATIVE_WIDTH, NATIVE_HEIGHT);

  // -- Pane outlines at final layout coordinates --------------------------
  for (const [pane, label] of [
    [VIEWPORT, 'VIEWPORT 440x290'],
    [LOG, 'LOG 440x110'],
    [PARTY, 'PARTY 200x400'],
  ] as const) {
    ctx.strokeStyle = '#566c86';
    ctx.strokeRect(pane.x + 0.5, pane.y + 0.5, pane.w - 1, pane.h - 1);
    ctx.fillStyle = '#94b0c2';
    ctx.font = '8px monospace';
    ctx.fillText(label, pane.x + 6, pane.y + 12);
  }

  // -- Viewport: deterministic star field + tick-stepped walker -----------
  for (const s of stars) {
    ctx.fillStyle = s.color;
    ctx.fillRect(s.x, s.y, 1, 1);
  }

  // A 3x3 pixel that advances one pixel per sim tick along the viewport
  // perimeter: smooth steady motion here = the fixed timestep is healthy.
  const inset = 20;
  const px = VIEWPORT.w - inset * 2;
  const py = VIEWPORT.h - inset * 2;
  const perimeter = 2 * (px + py);
  let d = tick % perimeter;
  let wx = VIEWPORT.x + inset;
  let wy = VIEWPORT.y + inset;
  if (d < px) {
    wx += d;
  } else if ((d -= px) < py) {
    wx += px;
    wy += d;
  } else if ((d -= py) < px) {
    wx += px - d;
    wy += py;
  } else {
    wy += py - (d - px);
  }
  ctx.fillStyle = '#ef7d57';
  ctx.fillRect(wx - 1, wy - 1, 3, 3);

  ctx.fillStyle = '#f4f4f4';
  ctx.font = '8px monospace';
  ctx.fillText(`tick ${tick}`, VIEWPORT.x + 6, VIEWPORT.y + VIEWPORT.h - 8);
  ctx.fillText(`scale x${scale}`, VIEWPORT.x + 80, VIEWPORT.y + VIEWPORT.h - 8);

  // -- Log pane: 1px checkerboard (crispness/moiré check) ------------------
  ctx.fillStyle = '#333c57';
  for (let y = LOG.y + 16; y < LOG.y + LOG.h - 6; y++) {
    for (let x = LOG.x + 6 + (y % 2); x < LOG.x + 214; x += 2) {
      ctx.fillRect(x, y, 1, 1);
    }
  }
  // Alignment grid: 8px lines should stay perfectly uniform when scaled.
  ctx.fillStyle = '#41a6f6';
  for (let x = LOG.x + 220; x < LOG.x + LOG.w - 6; x += 8) {
    ctx.fillRect(x, LOG.y + 16, 1, LOG.h - 22);
  }

  // -- Party pane: palette swatches ----------------------------------------
  PALETTE.forEach((color, i) => {
    const sx = PARTY.x + 8 + (i % 4) * 47;
    const sy = PARTY.y + 20 + Math.floor(i / 4) * 24;
    ctx.fillStyle = color;
    ctx.fillRect(sx, sy, 43, 20);
  });

  // -- Extreme-edge border: if any side is missing, scaling is cropping ----
  ctx.strokeStyle = '#a7f070';
  ctx.strokeRect(0.5, 0.5, NATIVE_WIDTH - 1, NATIVE_HEIGHT - 1);
}

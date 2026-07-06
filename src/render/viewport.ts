/**
 * First-person viewport compositor (plan §4). Painter's algorithm: fill the
 * ceiling and floor, then draw wall polygons back-to-front from the scene
 * draw list. Walls are procedurally shaded "programmer-art brick" — correct
 * perspective geometry, textured with mortar courses — so the look is right
 * without needing a sprite atlas yet (a PNG wall atlas swaps in later).
 *
 * Depth fog is done by palette bands per row (near/mid/far), matching the
 * retro palette-swap approach rather than alpha blending (§2.4).
 */

import { type Dir, type Vec2 } from '../core/grid';
import type { Level } from '../core/dungeon';
import { SWEETIE16 } from './palette';
import { text } from './text';
import { buildScene, maxLat, ROWS, type WallSlot } from './scene';
import {
  CONTENT,
  CX,
  HORIZON,
  frontRect,
  sideQuad,
  type FrontRect,
  type SideQuad,
} from './viewGeometry';

// Depth-fog ramps indexed by row (0 near .. 3 far).
const FRONT_FILL = [SWEETIE16.gray, SWEETIE16.slate, SWEETIE16.ink, SWEETIE16.navy];
const SIDE_FILL = [SWEETIE16.slate, SWEETIE16.ink, SWEETIE16.navy, SWEETIE16.black];
const MORTAR = SWEETIE16.black;

interface Pose {
  pos: Vec2;
  facing: Dir;
}

export interface ViewportOpts {
  showSlots?: boolean;
}

export function drawViewport(
  ctx: CanvasRenderingContext2D,
  level: Level,
  pose: Pose,
  opts: ViewportOpts = {},
): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(CONTENT.x, CONTENT.y, CONTENT.w, CONTENT.h);
  ctx.clip();

  drawCeilingFloor(ctx);

  const slots = buildScene(level, pose);
  for (const slot of slots) drawSlot(ctx, slot);

  if (opts.showSlots) drawSlotOverlay(ctx, slots);

  ctx.restore();
}

function drawCeilingFloor(ctx: CanvasRenderingContext2D): void {
  const bottom = CONTENT.y + CONTENT.h;
  // Ceiling: dark vault, lightening toward the horizon.
  band(ctx, CONTENT.y, HORIZON, [SWEETIE16.black, SWEETIE16.navy, SWEETIE16.ink]);
  // Floor: lighter near the horizon, darkening toward the feet.
  band(ctx, HORIZON, bottom, [SWEETIE16.slate, SWEETIE16.ink, SWEETIE16.black]);
}

function band(ctx: CanvasRenderingContext2D, y0: number, y1: number, colors: string[]): void {
  const h = (y1 - y0) / colors.length;
  colors.forEach((c, i) => {
    ctx.fillStyle = c;
    ctx.fillRect(CONTENT.x, Math.round(y0 + i * h), CONTENT.w, Math.ceil(h) + 1);
  });
}

function drawSlot(ctx: CanvasRenderingContext2D, slot: WallSlot): void {
  const sideFill = SIDE_FILL[slot.row] ?? SWEETIE16.black;
  const frontFill = FRONT_FILL[slot.row] ?? SWEETIE16.navy;
  // Side walls first, then the fronto-parallel face on top.
  if (slot.left) drawSideFace(ctx, sideQuad(slot.row, slot.lat, 'left'), sideFill);
  if (slot.right) drawSideFace(ctx, sideQuad(slot.row, slot.lat, 'right'), sideFill);
  if (slot.front) drawFrontFace(ctx, frontRect(slot.row, slot.lat), frontFill);
}

function drawFrontFace(ctx: CanvasRenderingContext2D, r: FrontRect, fill: string): void {
  const x0 = Math.round(r.x0);
  const x1 = Math.round(r.x1);
  const y0 = Math.round(r.y0);
  const y1 = Math.round(r.y1);
  const w = x1 - x0;
  const h = y1 - y0;
  if (w <= 0 || h <= 0) return;

  ctx.fillStyle = fill;
  ctx.fillRect(x0, y0, w, h);

  ctx.fillStyle = MORTAR;
  const courses = Math.max(2, Math.round(h / 13));
  const brickW = Math.max(6, w / 3);
  for (let k = 1; k < courses; k++) {
    const y = Math.round(y0 + (h * k) / courses);
    ctx.fillRect(x0, y, w, 1); // mortar course
  }
  for (let k = 0; k < courses; k++) {
    const cy0 = Math.round(y0 + (h * k) / courses);
    const cy1 = Math.round(y0 + (h * (k + 1)) / courses);
    const offset = k % 2 ? brickW / 2 : 0; // running bond
    for (let bx = x0 + offset; bx < x1; bx += brickW) {
      ctx.fillRect(Math.round(bx), cy0, 1, cy1 - cy0);
    }
  }
  // Frame the face so corners read cleanly.
  ctx.strokeStyle = MORTAR;
  ctx.strokeRect(x0 + 0.5, y0 + 0.5, w - 1, h - 1);
}

function drawSideFace(ctx: CanvasRenderingContext2D, q: SideQuad, fill: string): void {
  ctx.beginPath();
  ctx.moveTo(q.nearX, q.nearTop);
  ctx.lineTo(q.farX, q.farTop);
  ctx.lineTo(q.farX, q.farBot);
  ctx.lineTo(q.nearX, q.nearBot);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();

  ctx.strokeStyle = MORTAR;
  ctx.lineWidth = 1;
  ctx.stroke(); // outline

  // A couple of receding vertical seams and horizontal courses.
  for (const s of [0.34, 0.67]) {
    const x = q.nearX + (q.farX - q.nearX) * s;
    const top = q.nearTop + (q.farTop - q.nearTop) * s;
    const bot = q.nearBot + (q.farBot - q.nearBot) * s;
    line(ctx, x, top, x, bot);
  }
  for (const t of [0.34, 0.67]) {
    line(
      ctx,
      q.nearX,
      q.nearTop + (q.nearBot - q.nearTop) * t,
      q.farX,
      q.farTop + (q.farBot - q.farTop) * t,
    );
  }
}

function line(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number): void {
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
}

/** Debug: outline every frustum slot and label seen/open ones (plan M3). */
function drawSlotOverlay(ctx: CanvasRenderingContext2D, slots: WallSlot[]): void {
  const openKeys = new Set(slots.map((s) => `${s.row},${s.lat}`));
  ctx.lineWidth = 1;
  for (let row = 0; row < ROWS; row++) {
    for (let lat = -maxLat(row); lat <= maxLat(row); lat++) {
      const r = frontRect(row, lat);
      const seen = openKeys.has(`${row},${lat}`);
      ctx.strokeStyle = seen ? SWEETIE16.lime : SWEETIE16.red;
      ctx.strokeRect(r.x0 + 0.5, r.y0 + 0.5, r.x1 - r.x0 - 1, r.y1 - r.y0 - 1);
      text(ctx, `${row},${lat}`, r.x0 + 2, r.y0 + 2, SWEETIE16.white);
    }
  }
  // Horizon + centre line reference.
  ctx.strokeStyle = SWEETIE16.cyan;
  line(ctx, CONTENT.x, HORIZON + 0.5, CONTENT.x + CONTENT.w, HORIZON + 0.5);
  line(ctx, CX + 0.5, CONTENT.y, CX + 0.5, CONTENT.y + CONTENT.h);
}

/**
 * First-person viewport compositor (plan §4/§5). Painter's algorithm: fill
 * the ceiling and floor, then draw each visible cell back-to-front — floor
 * trigger marker, side walls, front wall — so nearer geometry overwrites
 * farther. Walls are procedurally-shaded brick; doors, buttons, levers, wall
 * text and floor triggers get their own simple programmer-art treatments.
 *
 * Depth fog is palette bands per row (near/mid/far), not alpha (§2.4).
 */

import { type Dir, type Vec2, turnLeft, turnRight } from '../core/grid';
import { type Level, cellAt, cellTriggerAt, edgeAt, type EdgeWall } from '../core/dungeon';
import type { Item } from '../core/item';
import type { Monster } from '../core/monster';
import { SWEETIE16 } from './palette';
import { drawItemIcon } from './itemIcon';
import { text } from './text';
import { buildScene, maxLat, ROWS, type WallSlot } from './scene';
import {
  CONTENT,
  CX,
  HORIZON,
  centroid,
  floorQuad,
  frontRect,
  sideQuad,
  type FrontRect,
  type Point,
  type SideQuad,
} from './viewGeometry';

const FRONT_FILL = [SWEETIE16.gray, SWEETIE16.slate, SWEETIE16.ink, SWEETIE16.navy];
const SIDE_FILL = [SWEETIE16.slate, SWEETIE16.ink, SWEETIE16.navy, SWEETIE16.black];
const MORTAR = SWEETIE16.black;
const DOOR_FILL = SWEETIE16.teal;
const DOOR_TRIM = SWEETIE16.cyan;

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
  monsters: Monster[] = [],
  opts: ViewportOpts = {},
): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(CONTENT.x, CONTENT.y, CONTENT.w, CONTENT.h);
  ctx.clip();

  drawCeilingFloor(ctx);

  const byCell = new Map<string, Monster>();
  for (const m of monsters) if (m.state !== 'dead') byCell.set(`${m.pos.x},${m.pos.y}`, m);

  const slots = buildScene(level, pose);
  for (const slot of slots) {
    drawSlot(ctx, level, pose.facing, slot);
    const m = byCell.get(`${slot.cell.x},${slot.cell.y}`);
    if (m && slot.row <= 3) drawMonster(ctx, slot.row, slot.lat, m);
  }

  if (opts.showSlots) drawSlotOverlay(ctx, slots);

  ctx.restore();
}

function drawCeilingFloor(ctx: CanvasRenderingContext2D): void {
  const bottom = CONTENT.y + CONTENT.h;
  band(ctx, CONTENT.y, HORIZON, [SWEETIE16.black, SWEETIE16.navy, SWEETIE16.ink]);
  band(ctx, HORIZON, bottom, [SWEETIE16.slate, SWEETIE16.ink, SWEETIE16.black]);
}

function band(ctx: CanvasRenderingContext2D, y0: number, y1: number, colors: string[]): void {
  const h = (y1 - y0) / colors.length;
  colors.forEach((c, i) => {
    ctx.fillStyle = c;
    ctx.fillRect(CONTENT.x, Math.round(y0 + i * h), CONTENT.w, Math.ceil(h) + 1);
  });
}

function drawSlot(ctx: CanvasRenderingContext2D, level: Level, facing: Dir, slot: WallSlot): void {
  const t = cellTriggerAt(level, slot.cell.x, slot.cell.y);
  if (t && t.visible !== false) drawFloorMarker(ctx, t.kind, slot.row, slot.lat);

  const items = cellAt(level, slot.cell.x, slot.cell.y)?.items;
  if (items && items.length > 0 && slot.row <= 2) drawFloorItems(ctx, slot.row, slot.lat, items);

  const sideFill = SIDE_FILL[slot.row] ?? SWEETIE16.black;
  const frontFill = FRONT_FILL[slot.row] ?? SWEETIE16.navy;

  if (slot.left) {
    const e = edgeAt(level, slot.cell.x, slot.cell.y, turnLeft(facing));
    const q = sideQuad(slot.row, slot.lat, 'left');
    drawSideFace(ctx, q, e?.kind === 'door' ? DOOR_FILL : sideFill);
    if (e?.kind !== 'door') decorate(ctx, centroid(sideCorners(q)), e);
  }
  if (slot.right) {
    const e = edgeAt(level, slot.cell.x, slot.cell.y, turnRight(facing));
    const q = sideQuad(slot.row, slot.lat, 'right');
    drawSideFace(ctx, q, e?.kind === 'door' ? DOOR_FILL : sideFill);
    if (e?.kind !== 'door') decorate(ctx, centroid(sideCorners(q)), e);
  }
  if (slot.front) {
    const e = edgeAt(level, slot.cell.x, slot.cell.y, facing);
    const r = frontRect(slot.row, slot.lat);
    if (e?.kind === 'door') {
      drawFrontDoor(ctx, r, e, slot.row);
    } else {
      drawFrontFace(ctx, r, frontFill);
      decorate(ctx, { x: (r.x0 + r.x1) / 2, y: (r.y0 + r.y1) / 2 }, e);
    }
  }
}

// -- Wall faces ------------------------------------------------------------

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
    ctx.fillRect(x0, Math.round(y0 + (h * k) / courses), w, 1);
  }
  for (let k = 0; k < courses; k++) {
    const cy0 = Math.round(y0 + (h * k) / courses);
    const cy1 = Math.round(y0 + (h * (k + 1)) / courses);
    const offset = k % 2 ? brickW / 2 : 0;
    for (let bx = x0 + offset; bx < x1; bx += brickW) {
      ctx.fillRect(Math.round(bx), cy0, 1, cy1 - cy0);
    }
  }
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
  ctx.stroke();

  for (const s of [0.34, 0.67]) {
    const x = q.nearX + (q.farX - q.nearX) * s;
    line(ctx, x, q.nearTop + (q.farTop - q.nearTop) * s, x, q.nearBot + (q.farBot - q.nearBot) * s);
  }
  for (const t of [0.34, 0.67]) {
    line(ctx, q.nearX, q.nearTop + (q.nearBot - q.nearTop) * t, q.farX, q.farTop + (q.farBot - q.farTop) * t);
  }
}

// -- Doors -----------------------------------------------------------------

function drawFrontDoor(ctx: CanvasRenderingContext2D, r: FrontRect, edge: EdgeWall, row: number): void {
  const progress = edge.door?.progress ?? 0;
  // A closed secret door is indistinguishable from the surrounding wall.
  if (edge.door?.secret && progress <= 0.001) {
    drawFrontFace(ctx, r, FRONT_FILL[row] ?? SWEETIE16.navy);
    return;
  }
  const x0 = Math.round(r.x0);
  const x1 = Math.round(r.x1);
  const y0 = Math.round(r.y0);
  const y1 = Math.round(r.y1);
  const w = x1 - x0;
  const h = y1 - y0;
  if (w <= 0 || h <= 0) return;

  // Portcullis retracts upward: visible panel shrinks from the bottom.
  const bottom = Math.round(y1 - progress * h);
  if (bottom > y0) {
    ctx.fillStyle = DOOR_FILL;
    ctx.fillRect(x0, y0, w, bottom - y0);
    ctx.fillStyle = MORTAR;
    for (let k = 1; k < 3; k++) ctx.fillRect(Math.round(x0 + (w * k) / 3), y0, 1, bottom - y0);
    ctx.fillRect(x0, Math.round(y0 + (bottom - y0) * 0.5), w, 1);
    ctx.strokeStyle = DOOR_TRIM;
    ctx.strokeRect(x0 + 0.5, y0 + 0.5, w - 1, bottom - y0 - 1);
  }
  // Door frame stays put.
  ctx.strokeStyle = MORTAR;
  ctx.strokeRect(x0 + 0.5, y0 + 0.5, w - 1, h - 1);
}

// -- Decals: buttons, levers, engraved text --------------------------------

function decorate(ctx: CanvasRenderingContext2D, at: Point, edge: EdgeWall | undefined): void {
  if (edge?.interact) {
    if (edge.interact.kind === 'button') {
      ctx.fillStyle = SWEETIE16.yellow;
      ctx.fillRect(Math.round(at.x) - 3, Math.round(at.y) - 3, 6, 6);
      ctx.strokeStyle = MORTAR;
      ctx.strokeRect(Math.round(at.x) - 3.5, Math.round(at.y) - 3.5, 6, 6);
    } else {
      ctx.fillStyle = SWEETIE16.orange;
      ctx.fillRect(Math.round(at.x) - 1, Math.round(at.y) - 5, 3, 10);
      ctx.fillStyle = SWEETIE16.yellow;
      ctx.fillRect(Math.round(at.x) - 2, Math.round(at.y) - 6, 5, 3);
    }
  } else if (edge?.alcove && edge.alcove.length > 0) {
    // A recessed niche with its contents peeking out.
    ctx.fillStyle = SWEETIE16.black;
    ctx.fillRect(Math.round(at.x) - 7, Math.round(at.y) - 7, 14, 14);
    ctx.strokeStyle = SWEETIE16.ink;
    ctx.strokeRect(Math.round(at.x) - 7.5, Math.round(at.y) - 7.5, 15, 15);
    const first = edge.alcove[0];
    if (first) drawItemIcon(ctx, first, Math.round(at.x) - 6, Math.round(at.y) - 6, 12);
  } else if (edge?.text) {
    ctx.fillStyle = SWEETIE16.gray;
    for (let i = 0; i < 3; i++) ctx.fillRect(Math.round(at.x) - 5, Math.round(at.y) - 3 + i * 3, 10, 1);
  }
}

// -- Floor markers ---------------------------------------------------------

function drawFloorMarker(ctx: CanvasRenderingContext2D, kind: string, row: number, lat: number): void {
  const q = floorQuad(row, lat);
  const c = centroid(q);
  const r = Math.max(3, (q[1].x - q[0].x) * 0.18);
  switch (kind) {
    case 'pit':
      polygon(ctx, quadInset(q, 0.12), SWEETIE16.black, SWEETIE16.ink);
      break;
    case 'plate':
      polygon(ctx, quadInset(q, 0.3), null, SWEETIE16.gray);
      break;
    case 'teleporter':
      polygon(
        ctx,
        [
          { x: c.x, y: c.y - r },
          { x: c.x + r, y: c.y },
          { x: c.x, y: c.y + r },
          { x: c.x - r, y: c.y },
        ],
        SWEETIE16.teal,
        SWEETIE16.cyan,
      );
      break;
    case 'stairs':
      ctx.fillStyle = SWEETIE16.lime;
      for (let i = -1; i <= 1; i++) ctx.fillRect(Math.round(c.x - r), Math.round(c.y + i * 3), Math.round(r * 2), 1);
      break;
    default:
      break;
  }
}

const MONSTER_H = [128, 82, 52, 36];

function drawMonster(ctx: CanvasRenderingContext2D, row: number, lat: number, m: Monster): void {
  const foot = centroid(floorQuad(row, lat));
  const h = MONSTER_H[row] ?? 30;
  const w = h * 0.55;
  const cx = foot.x;
  const top = foot.y - h;
  const body = m.flash > 0 ? SWEETIE16.red : m.species.color;

  // Body + head, outlined.
  ctx.fillStyle = body;
  ctx.strokeStyle = SWEETIE16.black;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.ellipse(cx, top + h * 0.64, w * 0.5, h * 0.36, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, top + h * 0.24, w * 0.34, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  text(ctx, m.species.glyph, Math.round(cx - 2), Math.round(top + h * 0.16), SWEETIE16.black);

  // HP pip above the head.
  const bw = w * 0.9;
  const ratio = Math.max(0, m.hp.cur / m.hp.max);
  ctx.fillStyle = SWEETIE16.ink;
  ctx.fillRect(Math.round(cx - bw / 2), Math.round(top - 5), Math.round(bw), 2);
  ctx.fillStyle = SWEETIE16.red;
  ctx.fillRect(Math.round(cx - bw / 2), Math.round(top - 5), Math.round(bw * ratio), 2);
}

function drawFloorItems(ctx: CanvasRenderingContext2D, row: number, lat: number, items: Item[]): void {
  const c = centroid(floorQuad(row, lat));
  const size = Math.max(6, 14 - row * 3);
  const shown = Math.min(items.length, 4);
  const startX = c.x - ((shown - 1) * (size + 1)) / 2;
  for (let i = 0; i < shown; i++) {
    const it = items[i]!;
    drawItemIcon(ctx, it, Math.round(startX + i * (size + 1) - size / 2), Math.round(c.y - size / 2), size);
  }
}

// -- Small helpers ---------------------------------------------------------

function sideCorners(q: SideQuad): Point[] {
  return [
    { x: q.nearX, y: q.nearTop },
    { x: q.farX, y: q.farTop },
    { x: q.farX, y: q.farBot },
    { x: q.nearX, y: q.nearBot },
  ];
}

function quadInset(pts: readonly Point[], t: number): Point[] {
  const c = centroid(pts);
  return pts.map((p) => ({ x: p.x + (c.x - p.x) * t, y: p.y + (c.y - p.y) * t }));
}

function polygon(
  ctx: CanvasRenderingContext2D,
  pts: readonly Point[],
  fill: string | null,
  stroke: string,
): void {
  ctx.beginPath();
  pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  ctx.closePath();
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1;
  ctx.stroke();
}

function line(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number): void {
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
}

function drawSlotOverlay(ctx: CanvasRenderingContext2D, slots: WallSlot[]): void {
  const openKeys = new Set(slots.map((s) => `${s.row},${s.lat}`));
  ctx.lineWidth = 1;
  for (let row = 0; row < ROWS; row++) {
    for (let lat = -maxLat(row); lat <= maxLat(row); lat++) {
      const r = frontRect(row, lat);
      ctx.strokeStyle = openKeys.has(`${row},${lat}`) ? SWEETIE16.lime : SWEETIE16.red;
      ctx.strokeRect(r.x0 + 0.5, r.y0 + 0.5, r.x1 - r.x0 - 1, r.y1 - r.y0 - 1);
      text(ctx, `${row},${lat}`, r.x0 + 2, r.y0 + 2, SWEETIE16.white);
    }
  }
  ctx.strokeStyle = SWEETIE16.cyan;
  line(ctx, CONTENT.x, HORIZON + 0.5, CONTENT.x + CONTENT.w, HORIZON + 0.5);
  line(ctx, CX + 0.5, CONTENT.y, CX + 0.5, CONTENT.y + CONTENT.h);
}

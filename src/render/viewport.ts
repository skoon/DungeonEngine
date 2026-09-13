/**
 * First-person viewport compositor (plan §4/§5). Painter's algorithm: lay down
 * the ceiling and floor fog bands, then draw each visible cell back-to-front —
 * paved ceiling and floor, trigger marker, side walls, front wall — so nearer
 * geometry overwrites farther. Authored wall, door, detail and floor-marker
 * sprites are preferred, with compact programmer-art fallbacks.
 *
 * Depth fog is palette bands per row (near/mid/far), not alpha (§2.4).
 */

import { type Dir, type Vec2, turnLeft, turnRight } from '../core/grid';
import { type Level, cellAt, cellTriggerAt, edgeAt, type EdgeWall } from '../core/dungeon';
import type { Item } from '../core/item';
import type { Monster } from '../core/monster';
import type { Projectile } from '../core/projectile';
import { SWEETIE16 } from './palette';
import { getTileset, type Tileset } from './tilesets';
import { drawItemIcon } from './itemIcon';
import { frameWidth } from './atlas';
import { sprites } from './sprites';
import {
  monsterFrame,
  monsterPose,
  floorMarkerFrame,
  doorFrame,
  detailFrame,
  projectileFrame,
  wallFrontFrame,
  wallSideFrame,
} from './spriteKeys';
import { text } from './text';
import { buildScene, maxLat, ROWS, type WallSlot } from './scene';
import {
  CONTENT,
  CX,
  HORIZON,
  ceilQuad,
  ceilY,
  centroid,
  floorQuad,
  floorY,
  frontRect,
  gridX,
  nearDepth,
  sideQuad,
  type FrontRect,
  type Point,
  type SideQuad,
} from './viewGeometry';

// The active level's tileset, set at the top of each drawViewport() and read
// by the draw helpers (rendering is single-threaded, so a module-level ref is
// simpler than threading it through every call).
let ts: Tileset = getTileset('brick');
// The tileset id, for atlas frame names (brick_front_0 …).
let tsId = 'brick';

interface Pose {
  pos: Vec2;
  facing: Dir;
}

export interface ViewportOpts {
  monsters?: Monster[];
  projectiles?: Projectile[];
  /** Whether a Light spell is active — illusions shimmer to hint at them. */
  lit?: boolean;
  showSlots?: boolean;
}

export function drawViewport(
  ctx: CanvasRenderingContext2D,
  level: Level,
  pose: Pose,
  opts: ViewportOpts = {},
): void {
  const monsters = opts.monsters ?? [];
  const projectiles = opts.projectiles ?? [];
  ts = getTileset(level.tileset);
  tsId = level.tileset;

  ctx.save();
  ctx.beginPath();
  ctx.rect(CONTENT.x, CONTENT.y, CONTENT.w, CONTENT.h);
  ctx.clip();

  drawCeilingFloor(ctx);

  const monsterByCell = new Map<string, Monster>();
  for (const m of monsters) if (m.state !== 'dead') monsterByCell.set(`${m.pos.x},${m.pos.y}`, m);
  const projByCell = new Map<string, Projectile[]>();
  for (const p of projectiles) {
    const key = `${p.pos.x},${p.pos.y}`;
    const list = projByCell.get(key);
    if (list) list.push(p);
    else projByCell.set(key, [p]);
  }

  const slots = buildScene(level, pose);
  for (const slot of slots) {
    drawSlot(ctx, level, pose.facing, slot, opts.lit ?? false);
    const key = `${slot.cell.x},${slot.cell.y}`;
    const m = monsterByCell.get(key);
    if (m && slot.row <= 3) drawMonster(ctx, slot.row, slot.lat, m, pose.facing);
    const ps = projByCell.get(key);
    if (ps && slot.row <= 3) for (const p of ps) drawProjectile(ctx, slot.row, slot.lat, p);
  }

  if (opts.showSlots) drawSlotOverlay(ctx, slots);

  ctx.restore();
}

function drawCeilingFloor(ctx: CanvasRenderingContext2D): void {
  const bottom = CONTENT.y + CONTENT.h;
  // Both ramps run near->far. On screen the ceiling recedes downward from
  // overhead to the horizon, so it draws in order; the floor recedes upward to
  // meet it, so its bands are laid bottom-up. Getting this backwards is what
  // paints the stone at your feet black.
  band(ctx, CONTENT.y, HORIZON, ts.ceiling);
  band(ctx, HORIZON, bottom, [...ts.floor].reverse());
}

function band(ctx: CanvasRenderingContext2D, y0: number, y1: number, colors: string[]): void {
  const h = (y1 - y0) / colors.length;
  colors.forEach((c, i) => {
    ctx.fillStyle = c;
    ctx.fillRect(CONTENT.x, Math.round(y0 + i * h), CONTENT.w, Math.ceil(h) + 1);
  });
  // Soften each hard band edge into the next tone. Depth fog is palette-only
  // (§2.4), so the ramp is dithered rather than blended.
  for (let i = 1; i < colors.length; i++) {
    ditherSeam(ctx, Math.round(y0 + i * h), colors[i - 1]!, colors[i]!);
  }
}

/** A 2px-period checkerboard straddling a fog-band boundary: the classic
 * palette-safe stand-in for a gradient. */
function ditherSeam(ctx: CanvasRenderingContext2D, y: number, above: string, below: string): void {
  const right = CONTENT.x + CONTENT.w;
  ctx.fillStyle = below;
  for (let x = CONTENT.x; x < right; x += 2) ctx.fillRect(x, y - 1, 1, 1);
  ctx.fillStyle = above;
  for (let x = CONTENT.x + 1; x < right; x += 2) ctx.fillRect(x, y, 1, 1);
}

function drawSlot(
  ctx: CanvasRenderingContext2D,
  level: Level,
  facing: Dir,
  slot: WallSlot,
  lit: boolean,
): void {
  paveCell(ctx, slot, 'floor');
  paveCell(ctx, slot, 'ceiling');

  const t = cellTriggerAt(level, slot.cell.x, slot.cell.y);
  if (t && t.visible !== false) drawFloorMarker(ctx, t.kind, slot.row, slot.lat);

  const items = cellAt(level, slot.cell.x, slot.cell.y)?.items;
  if (items && items.length > 0 && slot.row <= 2) drawFloorItems(ctx, slot.row, slot.lat, items);

  const sideFill = ts.side[slot.row] ?? SWEETIE16.black;
  const frontFill = ts.front[slot.row] ?? SWEETIE16.navy;

  if (slot.left) {
    const e = edgeAt(level, slot.cell.x, slot.cell.y, turnLeft(facing));
    const q = sideQuad(slot.row, slot.lat, 'left');
    drawSideFace(ctx, q, e?.kind === 'door' ? ts.door : sideFill, slot.row, e?.kind === 'door');
    if (e?.kind !== 'door') decorate(ctx, centroid(sideCorners(q)), e, lit, slot.row);
  }
  if (slot.right) {
    const e = edgeAt(level, slot.cell.x, slot.cell.y, turnRight(facing));
    const q = sideQuad(slot.row, slot.lat, 'right');
    drawSideFace(ctx, q, e?.kind === 'door' ? ts.door : sideFill, slot.row, e?.kind === 'door');
    if (e?.kind !== 'door') decorate(ctx, centroid(sideCorners(q)), e, lit, slot.row);
  }
  if (slot.front) {
    const e = edgeAt(level, slot.cell.x, slot.cell.y, facing);
    const r = frontRect(slot.row, slot.lat);
    if (e?.kind === 'door') {
      drawFrontDoor(ctx, r, e, slot.row);
    } else {
      drawFrontFace(ctx, r, frontFill, slot.row);
      decorate(ctx, { x: (r.x0 + r.x1) / 2, y: (r.y0 + r.y1) / 2 }, e, lit, slot.row);
    }
  }
}

// -- Ceiling & floor paving ------------------------------------------------

/**
 * Flagstone paving for one visible cell's floor or ceiling: a perspective-
 * correct quad filled with its depth tone, outlined in mortar, and — on the two
 * near rows, where there are pixels to spare — split into a 2x2 course of slabs.
 *
 * The light/dark alternation is keyed to the *world* cell rather than the
 * frustum slot, so the checker stays bolted to the dungeon as the party walks
 * instead of swimming along with the camera.
 */
function paveCell(ctx: CanvasRenderingContext2D, slot: WallSlot, surface: 'floor' | 'ceiling'): void {
  const isFloor = surface === 'floor';
  const yAt = isFloor ? floorY : ceilY;
  // Slabs are cut from the wall ramps, not the fog bands: those have one entry
  // per depth row (so row indexes them directly) and the floor reads as the same
  // stone as the walls around it. The vault takes `side`, a step darker than the
  // floor's `front`, since a torch lights what you walk on, not the roof.
  const tones = isFloor ? ts.front : ts.side;
  const alt = ((slot.cell.x + slot.cell.y) & 1) === 1;
  const quad = isFloor ? floorQuad(slot.row, slot.lat) : ceilQuad(slot.row, slot.lat);

  polygon(ctx, quad, rampTone(tones, slot.row, alt), ts.mortar);
  if (slot.row > 1) return; // far slabs are a few px deep — more seams is just noise

  // Seams sit on the cell's real mid-planes. The quad's screen midpoints would
  // bow under row 0's foreshortening; these project like everything else does.
  const nearZ = nearDepth(slot.row);
  const farZ = slot.row + 0.5;
  const midZ = (nearZ + farZ) / 2;
  ctx.strokeStyle = ts.mortar;
  ctx.lineWidth = 1;
  line(ctx, gridX(midZ, slot.lat - 0.5), yAt(midZ), gridX(midZ, slot.lat + 0.5), yAt(midZ));
  line(ctx, gridX(nearZ, slot.lat), yAt(nearZ), gridX(farZ, slot.lat), yAt(farZ));
}

/** Entry `idx` of a tileset ramp, clamped. `alt` steps one further along it
 * (back at the far end) so the paving checker always gets two distinct tones. */
export function rampTone(tones: readonly string[], idx: number, alt: boolean): string {
  const last = tones.length - 1;
  const i = Math.max(0, Math.min(last, idx));
  if (!alt) return tones[i]!;
  return tones[i + 1 <= last ? i + 1 : i - 1] ?? tones[i]!;
}

// -- Wall faces ------------------------------------------------------------

function drawFrontFace(ctx: CanvasRenderingContext2D, r: FrontRect, fill: string, row: number): void {
  const x0 = Math.round(r.x0);
  const x1 = Math.round(r.x1);
  const y0 = Math.round(r.y0);
  const y1 = Math.round(r.y1);
  const w = x1 - x0;
  const h = y1 - y0;
  if (w <= 0 || h <= 0) return;

  if (sprites.draw(ctx, wallFrontFrame(tsId, row), x0, y0, w, h)) return;

  ctx.fillStyle = fill;
  ctx.fillRect(x0, y0, w, h);

  ctx.fillStyle = ts.mortar;
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
  ctx.strokeStyle = ts.mortar;
  ctx.strokeRect(x0 + 0.5, y0 + 0.5, w - 1, h - 1);
}

function drawSideFace(ctx: CanvasRenderingContext2D, q: SideQuad, fill: string, row: number, isDoor = false): void {
  // Sprite side faces are trapezoids baked into a rectangular frame's alpha,
  // authored with the tall (near) edge on the RIGHT (a wall on the viewer's
  // right receding toward centre). When this quad's near edge is on the left,
  // mirror. Door side faces keep their procedural fill until matching side art
  // is authored; front door faces use the themed door atlas below.
  if (!isDoor) {
    const x = Math.min(q.nearX, q.farX);
    const w = Math.abs(q.nearX - q.farX);
    const h = q.nearBot - q.nearTop;
    if (
      w >= 1 &&
      sprites.draw(ctx, wallSideFrame(tsId, row), x, q.nearTop, w, h, { mirror: q.nearX < q.farX })
    ) {
      return;
    }
  }

  ctx.beginPath();
  ctx.moveTo(q.nearX, q.nearTop);
  ctx.lineTo(q.farX, q.farTop);
  ctx.lineTo(q.farX, q.farBot);
  ctx.lineTo(q.nearX, q.nearBot);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();

  ctx.strokeStyle = ts.mortar;
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
  // A closed secret door is indistinguishable from the surrounding wall —
  // unless Detect Secret has revealed it, which draws a faint dashed hint
  // without giving away exactly how to open it.
  if (edge.door?.secret && progress <= 0.001) {
    drawFrontFace(ctx, r, ts.front[row] ?? SWEETIE16.navy, row);
    if (edge.detected) drawDetectedHint(ctx, r);
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
    ctx.save();
    ctx.beginPath();
    ctx.rect(x0, y0, w, bottom - y0);
    ctx.clip();
    const authored = sprites.draw(ctx, doorFrame(tsId), x0, y0, w, h);
    ctx.restore();
    if (authored) {
      ctx.strokeStyle = ts.mortar;
      ctx.strokeRect(x0 + 0.5, y0 + 0.5, w - 1, h - 1);
      return;
    }
    ctx.fillStyle = ts.door;
    ctx.fillRect(x0, y0, w, bottom - y0);
    ctx.fillStyle = ts.mortar;
    for (let k = 1; k < 3; k++) ctx.fillRect(Math.round(x0 + (w * k) / 3), y0, 1, bottom - y0);
    ctx.fillRect(x0, Math.round(y0 + (bottom - y0) * 0.5), w, 1);
    ctx.strokeStyle = ts.doorTrim;
    ctx.strokeRect(x0 + 0.5, y0 + 0.5, w - 1, bottom - y0 - 1);
  }
  // Door frame stays put.
  ctx.strokeStyle = ts.mortar;
  ctx.strokeRect(x0 + 0.5, y0 + 0.5, w - 1, h - 1);
}

// -- Decals: buttons, levers, engraved text --------------------------------

function decorate(ctx: CanvasRenderingContext2D, at: Point, edge: EdgeWall | undefined, lit: boolean, row: number): void {
  const drawDetail = (kind: string, widthScale = 1, heightScale = 1): boolean => {
    const rowScale = [1, 0.72, 0.52, 0.38][row] ?? 0.38;
    const width = Math.max(5, 32 * rowScale * widthScale);
    const height = Math.max(4, 32 * rowScale * heightScale);
    return sprites.draw(ctx, detailFrame(kind), at.x - width / 2, at.y - height / 2, width, height);
  };

  if (edge?.kind === 'illusion') {
    if (edge.detected && !drawDetail('secret_hint')) {
      drawDetectedHint(ctx, { x0: at.x - 8, x1: at.x + 8, y0: at.y - 8, y1: at.y + 8 });
    }
    if (lit) {
      if (drawDetail('illusion_shimmer')) return;
      // A faint shimmer — light gives illusions away.
      ctx.fillStyle = SWEETIE16.cyan;
      const t = (Date.now() / 120) % 4;
      ctx.fillRect(Math.round(at.x - 6 + t * 3), Math.round(at.y - 4), 1, 1);
      ctx.fillRect(Math.round(at.x + 4 - t * 2), Math.round(at.y + 3), 1, 1);
      ctx.fillRect(Math.round(at.x - 2 + t), Math.round(at.y - 6), 1, 1);
    }
  }
  if (edge?.interact) {
    if (edge.interact.kind === 'button') {
      if (drawDetail('button')) return;
      ctx.fillStyle = SWEETIE16.yellow;
      ctx.fillRect(Math.round(at.x) - 3, Math.round(at.y) - 3, 6, 6);
      ctx.strokeStyle = ts.mortar;
      ctx.strokeRect(Math.round(at.x) - 3.5, Math.round(at.y) - 3.5, 6, 6);
    } else {
      if (drawDetail('lever', 0.8, 1.2)) return;
      ctx.fillStyle = SWEETIE16.orange;
      ctx.fillRect(Math.round(at.x) - 1, Math.round(at.y) - 5, 3, 10);
      ctx.fillStyle = SWEETIE16.yellow;
      ctx.fillRect(Math.round(at.x) - 2, Math.round(at.y) - 6, 5, 3);
    }
  } else if (edge?.alcove && edge.alcove.length > 0) {
    const authored = drawDetail('alcove', 1.1, 1.1);
    // A recessed niche with its contents peeking out.
    if (!authored) {
      ctx.fillStyle = SWEETIE16.black;
      ctx.fillRect(Math.round(at.x) - 7, Math.round(at.y) - 7, 14, 14);
      ctx.strokeStyle = SWEETIE16.ink;
      ctx.strokeRect(Math.round(at.x) - 7.5, Math.round(at.y) - 7.5, 15, 15);
    }
    const first = edge.alcove[0];
    if (first) drawItemIcon(ctx, first, Math.round(at.x) - 6, Math.round(at.y) - 6, 12);
  } else if (edge?.text) {
    if (drawDetail('inscription', 1.2, 0.7)) return;
    ctx.fillStyle = SWEETIE16.gray;
    for (let i = 0; i < 3; i++) ctx.fillRect(Math.round(at.x) - 5, Math.round(at.y) - 3 + i * 3, 10, 1);
  }
}

/** A dashed cyan outline hinting that Detect Secret found something here. */
function drawDetectedHint(ctx: CanvasRenderingContext2D, r: FrontRect): void {
  ctx.save();
  ctx.strokeStyle = SWEETIE16.cyan;
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 2]);
  ctx.strokeRect(r.x0 + 2.5, r.y0 + 2.5, r.x1 - r.x0 - 5, r.y1 - r.y0 - 5);
  ctx.restore();
}

// -- Floor markers ---------------------------------------------------------

function drawFloorMarker(ctx: CanvasRenderingContext2D, kind: string, row: number, lat: number): void {
  const q = floorQuad(row, lat);
  const c = centroid(q);
  const r = Math.max(3, (q[1].x - q[0].x) * 0.18);

  // Prefer authored top-down marker art, clipped to the projected floor cell;
  // the procedural shapes below remain a graceful fallback while an atlas is
  // loading or when a future trigger kind has no sprite yet.
  const markerW = Math.min(CONTENT.w * 0.8, Math.max(4, r * 1.8));
  const markerH = Math.max(3, markerW * 0.62);
  ctx.save();
  ctx.beginPath();
  q.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  ctx.closePath();
  ctx.clip();
  if (sprites.draw(ctx, floorMarkerFrame(kind), c.x - markerW / 2, c.y - markerH / 2, markerW, markerH)) {
    ctx.restore();
    return;
  }
  ctx.restore();

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
    case 'altar':
      // A glowing plus.
      ctx.fillStyle = SWEETIE16.yellow;
      ctx.fillRect(Math.round(c.x - 1), Math.round(c.y - r), 3, Math.round(r * 2));
      ctx.fillRect(Math.round(c.x - r), Math.round(c.y - 1), Math.round(r * 2), 3);
      break;
    case 'stairs':
      ctx.fillStyle = SWEETIE16.lime;
      for (let i = -1; i <= 1; i++) ctx.fillRect(Math.round(c.x - r), Math.round(c.y + i * 3), Math.round(r * 2), 1);
      break;
    case 'victory':
      // The dawn seal: a golden ring with a bright core (plan M14).
      ctx.strokeStyle = SWEETIE16.yellow;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(c.x, c.y, r * 0.8, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = SWEETIE16.white;
      ctx.fillRect(Math.round(c.x - 1), Math.round(c.y - 1), 3, 3);
      break;
    default:
      break;
  }
}

const MONSTER_H = [128, 82, 52, 36];

function drawMonster(ctx: CanvasRenderingContext2D, row: number, lat: number, m: Monster, viewFacing: Dir): void {
  const foot = centroid(floorQuad(row, lat));
  const h = MONSTER_H[row] ?? 30;
  const w = h * 0.55;
  const cx = foot.x;
  const top = foot.y - h;
  const body = m.flash > 0 ? SWEETIE16.red : m.species.color;

  // Sprite billboard: pose picked from the monster's facing relative to the
  // party's, tier from the depth row, anchored at the feet. Falls back to
  // the exact pose → side → procedural blob (sprite plan P3).
  const key = m.species.spriteKey;
  if (key) {
    const pv = monsterPose(m.facing, viewFacing);
    const name = [monsterFrame(key, pv.pose, row), monsterFrame(key, 'side', row)].find((n) => sprites.has(n));
    const def = name ? sprites.frame(name) : undefined;
    if (name && def) {
      const dh = h;
      const dw = (frameWidth(def) * dh) / def.h;
      const drawOpts = m.flash > 0 ? { mirror: pv.mirror, tint: SWEETIE16.red } : { mirror: pv.mirror };
      sprites.draw(ctx, name, cx - dw / 2, foot.y - dh, dw, dh, drawOpts);
      drawMonsterHp(ctx, cx, top, w, m);
      return;
    }
  }

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

  drawMonsterHp(ctx, cx, top, w, m);
}

/** HP pip above the head — shared by the sprite and procedural billboards. */
function drawMonsterHp(ctx: CanvasRenderingContext2D, cx: number, top: number, w: number, m: Monster): void {
  const bw = w * 0.9;
  const ratio = Math.max(0, m.hp.cur / m.hp.max);
  ctx.fillStyle = SWEETIE16.ink;
  ctx.fillRect(Math.round(cx - bw / 2), Math.round(top - 5), Math.round(bw), 2);
  ctx.fillStyle = SWEETIE16.red;
  ctx.fillRect(Math.round(cx - bw / 2), Math.round(top - 5), Math.round(bw * ratio), 2);
}

const PROJECTILE_SIZE = [11, 8, 6, 4];

function drawProjectile(ctx: CanvasRenderingContext2D, row: number, lat: number, p: Projectile): void {
  const q = floorQuad(row, lat);
  const c = centroid(q);
  const size = PROJECTILE_SIZE[row] ?? 4;
  // Flies at roughly chest height: partway from floor back up to the horizon.
  const y = c.y - (c.y - HORIZON) * 0.55;

  if (sprites.draw(ctx, projectileFrame(p.label, row), c.x - size / 2, y - size / 2, size, size)) return;

  ctx.fillStyle = p.color;
  ctx.strokeStyle = SWEETIE16.black;
  ctx.fillRect(Math.round(c.x - size / 2), Math.round(y - size / 2), size, size);
  ctx.strokeRect(Math.round(c.x - size / 2) + 0.5, Math.round(y - size / 2) + 0.5, size - 1, size - 1);
  text(ctx, p.glyph.slice(0, 1), Math.round(c.x - 2), Math.round(y - 4), SWEETIE16.black);
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

// -- Hit testing (§4.4): recompute the same geometry, no drawing ------------

export type ViewportPick = { kind: 'attack' } | { kind: 'use' } | { kind: 'floor' };

function monsterBox(row: number, lat: number): { x0: number; y0: number; x1: number; y1: number } {
  const foot = centroid(floorQuad(row, lat));
  const h = MONSTER_H[row] ?? 30;
  const w = h * 0.55;
  return { x0: foot.x - w / 2, y0: foot.y - h, x1: foot.x + w / 2, y1: foot.y };
}

function inBox(pt: Point, b: { x0: number; y0: number; x1: number; y1: number }): boolean {
  return pt.x >= b.x0 && pt.x <= b.x1 && pt.y >= b.y0 && pt.y <= b.y1;
}

function edgeActionable(e: EdgeWall | undefined): boolean {
  if (!e) return false;
  if (e.interact) return true;
  if (e.kind === 'door' && e.door && !e.door.open && e.door.keyId) return true;
  return !!e.alcove && e.alcove.length > 0;
}

/**
 * What, if anything, a viewport click lands on. Recomputes the visible
 * scene + projection (deterministic, matching the draw pass) and tests the
 * point near-to-far so nearer things win — no coupling to rendering.
 */
export function pickViewport(
  level: Level,
  pose: Pose,
  monsters: Monster[],
  pt: Point,
): ViewportPick | null {
  const occupied = new Set<string>();
  for (const m of monsters) if (m.state !== 'dead') occupied.add(`${m.pos.x},${m.pos.y}`);

  const slots = buildScene(level, pose);
  for (let i = slots.length - 1; i >= 0; i--) {
    const slot = slots[i]!;
    if (occupied.has(`${slot.cell.x},${slot.cell.y}`) && slot.row <= 3 && inBox(pt, monsterBox(slot.row, slot.lat))) {
      return { kind: 'attack' };
    }
    if (slot.front) {
      const e = edgeAt(level, slot.cell.x, slot.cell.y, pose.facing);
      if (edgeActionable(e)) {
        const r = frontRect(slot.row, slot.lat);
        if (inBox(pt, { x0: r.x0, y0: r.y0, x1: r.x1, y1: r.y1 })) return { kind: 'use' };
      }
    }
    if (slot.row === 0) {
      const items = cellAt(level, slot.cell.x, slot.cell.y)?.items;
      if (items && items.length > 0) {
        const c = centroid(floorQuad(0, slot.lat));
        if (inBox(pt, { x0: c.x - 24, y0: c.y - 14, x1: c.x + 24, y1: c.y + 14 })) return { kind: 'floor' };
      }
    }
  }
  return null;
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

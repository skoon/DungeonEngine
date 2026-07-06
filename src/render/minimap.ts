/**
 * Debug top-down minimap — the M2 stand-in for the first-person viewport.
 * Renders the whole level from above with the party's position and facing,
 * so movement is visible and verifiable before the real renderer exists
 * (plan M2). In M3 the first-person view takes the viewport and this map
 * moves to a debug hotkey — but it stays in the codebase forever.
 */

import { type Dir, type Vec2, delta, turnRight } from '../core/grid';
import { cellAt } from '../core/dungeon';
import type { Level } from '../core/dungeon';
import { COLORS } from './palette';
import { VIEWPORT, inset } from './layout';
import { text } from './text';

const TITLE_H = 12;

export function drawMinimap(
  ctx: CanvasRenderingContext2D,
  level: Level,
  pose: { pos: Vec2; facing: Dir },
): void {
  const content = inset(VIEWPORT, 5);
  ctx.save();
  ctx.beginPath();
  ctx.rect(content.x, content.y, content.w, content.h);
  ctx.clip();

  text(ctx, `${level.name}  (debug map)`, content.x, content.y, COLORS.textDim);

  const gridW = content.w;
  const gridH = content.h - TITLE_H;
  const cell = Math.max(3, Math.floor(Math.min(gridW / level.width, gridH / level.height)));
  const ox = content.x + Math.floor((gridW - cell * level.width) / 2);
  const oy = content.y + TITLE_H + Math.floor((gridH - cell * level.height) / 2);

  // Cells: 1px gap between fills reads as a grid.
  for (let y = 0; y < level.height; y++) {
    for (let x = 0; x < level.width; x++) {
      const solid = cellAt(level, x, y)?.solid ?? true;
      ctx.fillStyle = solid ? COLORS.mapSolid : COLORS.mapFloor;
      ctx.fillRect(ox + x * cell, oy + y * cell, cell - 1, cell - 1);
    }
  }

  // Edge walls: bright lines on the shared cell boundary.
  ctx.fillStyle = COLORS.mapEdge;
  for (const key of level.edges.keys()) {
    const [kind, xs, ys] = key.split(':');
    const x = Number(xs);
    const y = Number(ys);
    if (kind === 'v') {
      ctx.fillRect(ox + (x + 1) * cell - 1, oy + y * cell, 1, cell);
    } else {
      ctx.fillRect(ox + x * cell, oy + (y + 1) * cell - 1, cell, 1);
    }
  }

  drawPartyMarker(ctx, ox, oy, cell, pose);
  ctx.restore();
}

function drawPartyMarker(
  ctx: CanvasRenderingContext2D,
  ox: number,
  oy: number,
  cell: number,
  pose: { pos: Vec2; facing: Dir },
): void {
  const cx = ox + pose.pos.x * cell + (cell - 1) / 2;
  const cy = oy + pose.pos.y * cell + (cell - 1) / 2;
  const d = delta(pose.facing);
  const p = delta(turnRight(pose.facing)); // perpendicular
  const r = Math.max(2, cell * 0.38);

  ctx.fillStyle = COLORS.mapParty;
  ctx.beginPath();
  ctx.moveTo(cx + d.x * r, cy + d.y * r); // apex points where you face
  ctx.lineTo(cx - d.x * r + p.x * r * 0.8, cy - d.y * r + p.y * r * 0.8);
  ctx.lineTo(cx - d.x * r - p.x * r * 0.8, cy - d.y * r - p.y * r * 0.8);
  ctx.closePath();
  ctx.fill();
}

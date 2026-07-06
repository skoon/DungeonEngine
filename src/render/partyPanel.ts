/**
 * Party panel — four character cards plus a compass. The roster here is
 * hard-coded placeholder data (static bars); the real character model,
 * live portraits, hand slots, and formation swapping arrive in M5. The
 * compass, however, reflects the live party facing so the panel visibly
 * responds to input in M2.
 */

import { type Dir, DIR_NAME } from '../core/grid';
import { COLORS, CLASS_COLOR } from './palette';
import { COMPASS, PARTY_CARDS, type Rect } from './layout';
import { text } from './text';

interface CardData {
  name: string;
  clazz: string;
  hp: [number, number];
  mp: [number, number];
}

const ROSTER: CardData[] = [
  { name: 'Kestra', clazz: 'Fighter', hp: [24, 24], mp: [0, 0] },
  { name: 'Bram', clazz: 'Cleric', hp: [17, 20], mp: [8, 12] },
  { name: 'Sable', clazz: 'Mage', hp: [12, 12], mp: [14, 16] },
  { name: 'Pip', clazz: 'Thief', hp: [16, 16], mp: [0, 0] },
];

export function drawPartyPanel(ctx: CanvasRenderingContext2D, facing: Dir): void {
  ROSTER.forEach((data, i) => {
    const rect = PARTY_CARDS[i];
    if (rect) drawCard(ctx, rect, data);
  });
  drawCompass(ctx, facing);
}

function drawCard(ctx: CanvasRenderingContext2D, r: Rect, data: CardData): void {
  const accent = CLASS_COLOR[data.clazz] ?? COLORS.text;

  // Portrait: dark box, class-accent border + initial.
  const px = r.x + 4;
  const py = r.y + 4;
  ctx.fillStyle = COLORS.slotBg;
  ctx.fillRect(px, py, 26, 26);
  ctx.strokeStyle = accent;
  ctx.strokeRect(px + 0.5, py + 0.5, 25, 25);
  text(ctx, data.name.charAt(0), px + 10, py + 9, accent);

  const tx = px + 34;
  text(ctx, data.name, tx, py, COLORS.text);
  text(ctx, data.clazz, tx, py + 10, COLORS.textDim);

  bar(ctx, tx, py + 22, 118, data.hp, COLORS.hpFill);
  text(ctx, `HP ${data.hp[0]}/${data.hp[1]}`, tx, py + 22, COLORS.text);
  if (data.mp[1] > 0) {
    bar(ctx, tx, py + 34, 118, data.mp, COLORS.manaFill);
    text(ctx, `MP ${data.mp[0]}/${data.mp[1]}`, tx, py + 34, COLORS.text);
  }

  // Two hand slots (empty in M2).
  hand(ctx, r.x + 4, r.y + r.h - 20, 'L');
  hand(ctx, r.x + 24, r.y + r.h - 20, 'R');
}

function bar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  value: [number, number],
  fill: string,
): void {
  const ratio = value[1] > 0 ? Math.max(0, Math.min(1, value[0] / value[1])) : 0;
  ctx.fillStyle = COLORS.hpBack;
  ctx.fillRect(x, y, w, 8);
  ctx.fillStyle = fill;
  ctx.fillRect(x, y, Math.round(w * ratio), 8);
}

function hand(ctx: CanvasRenderingContext2D, x: number, y: number, label: string): void {
  ctx.fillStyle = COLORS.slotBg;
  ctx.fillRect(x, y, 16, 16);
  ctx.strokeStyle = COLORS.slotBorder;
  ctx.strokeRect(x + 0.5, y + 0.5, 15, 15);
  text(ctx, label, x + 5, y + 4, COLORS.textDim);
}

function drawCompass(ctx: CanvasRenderingContext2D, facing: Dir): void {
  const cx = COMPASS.x + COMPASS.w / 2;
  const cy = COMPASS.y + COMPASS.h / 2;
  // Letters at N/E/S/W; active facing highlighted.
  const marks: { label: string; dir: Dir; dx: number; dy: number }[] = [
    { label: 'N', dir: 0, dx: 0, dy: -12 },
    { label: 'E', dir: 1, dx: 14, dy: -4 },
    { label: 'S', dir: 2, dx: 0, dy: 4 },
    { label: 'W', dir: 3, dx: -18, dy: -4 },
  ];
  for (const m of marks) {
    text(ctx, m.label, cx + m.dx - 2, cy + m.dy, m.dir === facing ? COLORS.compassOn : COLORS.compassOff);
  }
  text(ctx, `facing ${DIR_NAME[facing]}`, COMPASS.x, COMPASS.y + COMPASS.h - 10, COLORS.textDim);
}

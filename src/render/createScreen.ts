/**
 * Party-creation screen (plan M10). Four adventurer panels in a 2x2 grid,
 * each with an editable name, a cyclable class, a reroll button, rolled
 * stats, and a live HP/MP preview — plus Reroll All and Begin. Keyboard and
 * mouse both drive it via a flat control list shared by draw and hit-test.
 */

import { CLASSES } from '../data/classes';
import { type CreationMember, previewHpMp } from '../data/creation';
import { COLORS, SWEETIE16, CLASS_COLOR } from './palette';
import { NATIVE_HEIGHT, NATIVE_WIDTH } from './screen';
import { contains, type Rect } from './layout';
import { text } from './text';

export type ControlKind = 'name' | 'class' | 'reroll' | 'rerollAll' | 'begin';
export interface Control {
  kind: ControlKind;
  member: number; // -1 for global controls
  rect: Rect;
}

const PANEL_W = 300;
const PANEL_H = 148;
const RANKS = ['Front rank', 'Front rank', 'Back rank', 'Back rank'];

function panelRect(i: number): Rect {
  const col = i % 2;
  const row = Math.floor(i / 2);
  return { x: 16 + col * (PANEL_W + 8), y: 44 + row * (PANEL_H + 8), w: PANEL_W, h: PANEL_H };
}

/** Build the flat, tab-ordered control list (static geometry). */
export function buildControls(): Control[] {
  const out: Control[] = [];
  for (let m = 0; m < 4; m++) {
    const p = panelRect(m);
    out.push({ kind: 'name', member: m, rect: { x: p.x + 44, y: p.y + 26, w: 200, h: 16 } });
    out.push({ kind: 'class', member: m, rect: { x: p.x + 10, y: p.y + 50, w: 150, h: 15 } });
    out.push({ kind: 'reroll', member: m, rect: { x: p.x + 172, y: p.y + 50, w: 118, h: 15 } });
  }
  out.push({ kind: 'rerollAll', member: -1, rect: { x: 16, y: NATIVE_HEIGHT - 30, w: 130, h: 20 } });
  out.push({ kind: 'begin', member: -1, rect: { x: NATIVE_WIDTH - 150, y: NATIVE_HEIGHT - 30, w: 134, h: 20 } });
  return out;
}

export function hitControl(controls: Control[], x: number, y: number): number {
  return controls.findIndex((c) => contains(c.rect, x, y));
}

export function drawCreate(
  ctx: CanvasRenderingContext2D,
  members: CreationMember[],
  controls: Control[],
  focus: number,
): void {
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, NATIVE_WIDTH, NATIVE_HEIGHT);
  ctx.font = 'bold 16px monospace';
  ctx.textBaseline = 'top';
  ctx.fillStyle = SWEETIE16.yellow;
  ctx.fillText('ASSEMBLE YOUR PARTY', 16, 14);
  text(ctx, 'type to name · click or arrows to choose · Enter to reroll/begin', 250, 20, COLORS.textDim);

  members.forEach((m, i) => drawPanel(ctx, i, m, focus, controls));

  drawButton(ctx, controls[controls.length - 2]!, 'Reroll All', focus, controls);
  drawButton(ctx, controls[controls.length - 1]!, 'Begin ▶', focus, controls);
}

function drawPanel(ctx: CanvasRenderingContext2D, i: number, m: CreationMember, focus: number, controls: Control[]): void {
  const p = panelRect(i);
  ctx.fillStyle = COLORS.contentBg;
  ctx.fillRect(p.x, p.y, p.w, p.h);
  ctx.strokeStyle = COLORS.frameHi;
  ctx.strokeRect(p.x + 0.5, p.y + 0.5, p.w - 1, p.h - 1);

  const accent = CLASS_COLOR[CLASSES[m.clazz].name] ?? COLORS.text;

  // Rank tag + portrait.
  text(ctx, RANKS[i] ?? '', p.x + 10, p.y + 8, COLORS.textDim);
  ctx.fillStyle = COLORS.slotBg;
  ctx.fillRect(p.x + 10, p.y + 22, 26, 26);
  ctx.strokeStyle = accent;
  ctx.strokeRect(p.x + 10.5, p.y + 22.5, 25, 25);
  text(ctx, (m.name || '?').charAt(0), p.x + 20, p.y + 31, accent);

  // Name field (control 0 for this member).
  drawField(ctx, controlFor(controls, i, 'name'), m.name || '', focus, controls, true);
  // Class selector.
  drawField(ctx, controlFor(controls, i, 'class'), `◄ ${CLASSES[m.clazz].name} ►`, focus, controls, false);
  // Reroll.
  drawButton(ctx, controlFor(controls, i, 'reroll'), 'Reroll stats', focus, controls);

  // Stats + derived.
  const s = m.stats;
  const mod = (v: number): string => { const md = Math.floor((v - 10) / 2); return `${v}${md >= 0 ? '+' + md : md}`; };
  text(ctx, `STR ${mod(s.str)}   DEX ${mod(s.dex)}   CON ${mod(s.con)}`, p.x + 10, p.y + 78, COLORS.text);
  text(ctx, `INT ${mod(s.int)}   WIS ${mod(s.wis)}`, p.x + 10, p.y + 92, COLORS.text);
  const hpmp = previewHpMp(m.clazz, m.stats);
  text(ctx, `HP ${hpmp.hpMax}${hpmp.mpMax > 0 ? `   MP ${hpmp.mpMax}` : ''}`, p.x + 10, p.y + 112, accent);
}

function controlFor(controls: Control[], member: number, kind: ControlKind): Control {
  return controls.find((c) => c.member === member && c.kind === kind)!;
}

function isFocused(controls: Control[], c: Control, focus: number): boolean {
  return controls[focus] === c;
}

function drawField(ctx: CanvasRenderingContext2D, c: Control, value: string, focus: number, controls: Control[], caret: boolean): void {
  const on = isFocused(controls, c, focus);
  ctx.fillStyle = on ? COLORS.frameFace : COLORS.slotBg;
  ctx.fillRect(c.rect.x, c.rect.y, c.rect.w, c.rect.h);
  ctx.strokeStyle = on ? SWEETIE16.yellow : COLORS.slotBorder;
  ctx.strokeRect(c.rect.x + 0.5, c.rect.y + 0.5, c.rect.w - 1, c.rect.h - 1);
  const shown = value + (on && caret ? '_' : '');
  text(ctx, shown, c.rect.x + 5, c.rect.y + 4, on ? SWEETIE16.yellow : COLORS.text);
}

function drawButton(ctx: CanvasRenderingContext2D, c: Control, label: string, focus: number, controls: Control[]): void {
  const on = isFocused(controls, c, focus);
  ctx.fillStyle = on ? COLORS.frameFace : COLORS.slotBg;
  ctx.fillRect(c.rect.x, c.rect.y, c.rect.w, c.rect.h);
  ctx.strokeStyle = on ? SWEETIE16.yellow : COLORS.frameHi;
  ctx.strokeRect(c.rect.x + 0.5, c.rect.y + 0.5, c.rect.w - 1, c.rect.h - 1);
  text(ctx, label, c.rect.x + Math.round((c.rect.w - label.length * 6) / 2), c.rect.y + Math.round((c.rect.h - 8) / 2), on ? SWEETIE16.yellow : COLORS.text);
}

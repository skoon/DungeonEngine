/**
 * Town-service overlay (plan M-DR5). Opens when the party steps onto the
 * raise-dead shrine or the recruiter's notice board in the Town Hub. Two
 * modes share one flat, tab-ordered row list (like the creation screen), so
 * draw and hit-test agree:
 *
 *   - 'raise':   one row per party member; the dead can be raised for gold.
 *   - 'recruit': a rolled candidate (reroll / cycle class) plus one row per
 *                slot to hire the candidate into, replacing whoever is there.
 *
 * The sim is paused while open, matching the other overlays.
 */

import type { Roster } from '../core/roster';
import { CLASSES } from '../data/classes';
import type { CreationMember } from '../data/creation';
import { previewHpMp } from '../data/creation';
import { RECRUIT_COST, raiseCost } from '../core/world';
import { COLORS, SWEETIE16, CLASS_COLOR } from './palette';
import { NATIVE_HEIGHT, NATIVE_WIDTH } from './screen';
import { drawCloseButton } from './controls';
import { statMod } from '../core/character';
import { text } from './text';

export type TownMode = 'raise' | 'recruit';

export type TownRow =
  | { kind: 'raise'; member: number }
  | { kind: 'reroll' }
  | { kind: 'class' }
  | { kind: 'hire'; member: number };

const ROW_H = 16;
const TOP = 84;
const LEFT = 24;
const ROW_W = NATIVE_WIDTH - 48;

/** The flat, navigable row list for a mode (shared by draw + hit-test). */
export function buildTownRows(mode: TownMode, roster: Roster): TownRow[] {
  if (mode === 'raise') {
    return roster.members.map((_, member) => ({ kind: 'raise', member }));
  }
  return [
    { kind: 'reroll' },
    { kind: 'class' },
    ...roster.members.map((_, member): TownRow => ({ kind: 'hire', member })),
  ];
}

function rowRectY(i: number): number {
  return TOP + i * ROW_H;
}

export function drawTownOverlay(
  ctx: CanvasRenderingContext2D,
  mode: TownMode,
  roster: Roster,
  rows: TownRow[],
  cursor: number,
  candidate: CreationMember | null,
): void {
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, NATIVE_WIDTH, NATIVE_HEIGHT);
  text(ctx, mode === 'raise' ? 'SHRINE OF SECOND CHANCES' : 'HIRING BOARD', 8, 6, COLORS.title);
  text(ctx, `Gold: ${roster.gold}`, NATIVE_WIDTH - 120, 6, SWEETIE16.yellow);
  text(ctx, 'up/down move   Enter choose   Esc / X close', 8, 18, COLORS.textDim);

  drawCloseButton(ctx);

  if (mode === 'raise') {
    text(ctx, 'Choose a fallen companion to raise:', LEFT, TOP - 20, COLORS.text);
  } else if (candidate) {
    drawCandidate(ctx, candidate);
  }

  rows.forEach((row, i) => {
    const y = rowRectY(i);
    if (i === cursor) {
      ctx.fillStyle = SWEETIE16.ink;
      ctx.fillRect(LEFT - 4, y - 2, ROW_W + 8, ROW_H);
    }
    text(ctx, rowLabel(row, roster), LEFT, y + 2, rowColor(row, roster, i === cursor, candidate));
  });
}

function drawCandidate(ctx: CanvasRenderingContext2D, m: CreationMember): void {
  const accent = CLASS_COLOR[CLASSES[m.clazz].name] ?? COLORS.text;
  text(ctx, 'Candidate:', LEFT, TOP - 44, COLORS.textDim);
  text(ctx, `${m.name}  the ${CLASSES[m.clazz].name}`, LEFT + 70, TOP - 44, accent);
  const s = m.stats;
  const mod = (v: number): string => `${v}${statMod(v) >= 0 ? '+' + statMod(v) : statMod(v)}`;
  text(ctx, `STR ${mod(s.str)}  DEX ${mod(s.dex)}  CON ${mod(s.con)}  INT ${mod(s.int)}  WIS ${mod(s.wis)}`, LEFT, TOP - 30, COLORS.text);
  const hpmp = previewHpMp(m.clazz, m.stats);
  text(ctx, `HP ${hpmp.hpMax}${hpmp.mpMax > 0 ? `   MP ${hpmp.mpMax}` : ''}`, LEFT + 320, TOP - 30, accent);
}

function rowLabel(row: TownRow, roster: Roster): string {
  if (row.kind === 'reroll') return '↻  Reroll candidate stats';
  if (row.kind === 'class') return '◄ ►  Change candidate class';
  const c = roster.member(row.member)!;
  const who = `${c.name}  (L${c.level} ${CLASSES[c.clazz].name})`;
  if (row.kind === 'raise') {
    return c.conditions.has('dead')
      ? `${who.padEnd(28)} — Raise for ${raiseCost(c.level)} gold`
      : `${who.padEnd(28)} — ${c.hp.cur > 0 ? 'alive' : 'dying'}`;
  }
  return `Hire into ${who.padEnd(24)} — ${RECRUIT_COST} gold`;
}

function rowColor(row: TownRow, roster: Roster, on: boolean, candidate: CreationMember | null): string {
  if (row.kind === 'raise') {
    const c = roster.member(row.member)!;
    if (!c.conditions.has('dead')) return COLORS.textDim; // nothing to do
    const afford = roster.gold >= raiseCost(c.level);
    return on ? COLORS.title : afford ? COLORS.text : COLORS.textDim;
  }
  if (row.kind === 'hire') {
    const afford = roster.gold >= RECRUIT_COST && candidate !== null;
    return on ? COLORS.title : afford ? COLORS.text : COLORS.textDim;
  }
  return on ? COLORS.title : COLORS.text;
}

/** Index of the row under a point, or -1. */
export function hitTownRow(rowCount: number, x: number, y: number): number {
  if (x < LEFT - 4 || x > LEFT - 4 + ROW_W + 8) return -1;
  const i = Math.floor((y - (TOP - 2)) / ROW_H);
  return i >= 0 && i < rowCount ? i : -1;
}

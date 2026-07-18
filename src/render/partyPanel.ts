/**
 * Party panel — four live character cards plus a compass. Reads the real
 * roster (plan §2.2): portraits grey out at 0 HP, HP/MP bars and hand-slot
 * icons come from character state, and condition icons flag status. The
 * compass reflects live facing. Formation swap and click-to-open sheet are
 * mouse UX (M8); the inventory overlay opens with a key for now.
 */

import { type Dir, DIR_NAME } from '../core/grid';
import { type Character, armorClass, isDisabled } from '../core/character';
import type { Roster } from '../core/roster';
import { COLORS, CLASS_COLOR, SWEETIE16 } from './palette';
import { CLASSES } from '../data/classes';
import { COMPASS, PARTY_CARDS, type Rect } from './layout';
import { drawItemIcon, drawSlotBox } from './itemIcon';
import { sprites } from './sprites';
import { portraitFrame } from './spriteKeys';
import { text } from './text';

const COND_ICON: Record<string, string> = {
  poisoned: 'P',
  paralyzed: 'Z',
  unconscious: 'K',
  dead: '+',
};

export function drawPartyPanel(
  ctx: CanvasRenderingContext2D,
  roster: Roster,
  facing: Dir,
  selected?: number,
): void {
  roster.members.forEach((member, i) => {
    const rect = PARTY_CARDS[i];
    if (!rect) return;
    drawCard(ctx, rect, member, (roster.hurt[i] ?? 0) > 0, (roster.healFlash[i] ?? 0) > 0);
    if (i === selected) {
      // Formation swap: this card is picked, awaiting a partner (M8).
      ctx.strokeStyle = SWEETIE16.yellow;
      ctx.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.w - 1, rect.h - 1);
    }
  });
  drawCompass(ctx, facing);
  // Shared coin purse (plan M-DR5).
  text(ctx, `Gold ${roster.gold}`, COMPASS.x, COMPASS.y - 10, SWEETIE16.yellow);
}

function drawCard(ctx: CanvasRenderingContext2D, r: Rect, c: Character, hurt: boolean, healed: boolean): void {
  const down = isDisabled(c);
  const dead = c.conditions.has('dead');
  const dying = !dead && c.hp.cur <= 0; // unconscious and bleeding out
  const accent = down ? COLORS.textDim : CLASS_COLOR[CLASSES[c.clazz].name] ?? COLORS.text;

  // Damage/heal flash: a colour wash over the whole card.
  if (hurt) {
    ctx.fillStyle = SWEETIE16.red;
    ctx.fillRect(r.x, r.y, r.w, r.h);
  } else if (healed) {
    ctx.fillStyle = SWEETIE16.green;
    ctx.fillRect(r.x, r.y, r.w, r.h);
  }

  // Portrait (greyed when down).
  const px = r.x + 4;
  const py = r.y + 4;
  ctx.fillStyle = COLORS.slotBg;
  ctx.fillRect(px, py, 26, 26);
  ctx.strokeStyle = accent;
  ctx.strokeRect(px + 0.5, py + 0.5, 25, 25);
  // 24×24 portrait sprite centred in the 26px card box; initial-letter
  // fallback until portrait art is loaded.
  const drew = down
    ? sprites.draw(ctx, portraitFrame(c.portrait), px + 1, py + 1, 24, 24, { grayscale: true })
    : sprites.draw(ctx, portraitFrame(c.portrait), px + 1, py + 1, 24, 24);
  if (!drew) text(ctx, c.name.charAt(0), px + 10, py + 9, accent);

  const tx = px + 34;
  text(ctx, c.name, tx, py, down ? COLORS.textDim : COLORS.text);
  text(ctx, `L${c.level} ${CLASSES[c.clazz].name}  AC${armorClass(c)}`, tx, py + 10, COLORS.textDim);

  bar(ctx, tx, py + 22, 118, c.hp.cur, c.hp.max, COLORS.hpFill);
  const hpColor = dead ? SWEETIE16.red : dying ? SWEETIE16.orange : COLORS.text;
  const hpLabel = dead ? 'DEAD' : dying ? `DYING ${c.hp.cur}` : `HP ${c.hp.cur}/${c.hp.max}`;
  text(ctx, hpLabel, tx, py + 22, hpColor);
  if (c.mp.max > 0) {
    bar(ctx, tx, py + 34, 118, c.mp.cur, c.mp.max, COLORS.manaFill);
    text(ctx, `MP ${c.mp.cur}/${c.mp.max}`, tx, py + 34, COLORS.text);
    if (c.spellCooldown > 0) text(ctx, 'casting...', tx + 122, py + 34, COLORS.textDim);
  }
  if (c.buff) text(ctx, `+${c.buff.acBonus} AC`, tx + 122, py + 22, SWEETIE16.azure);

  // Two hand slots showing the equipped items.
  hand(ctx, c, 0, r.x + 4, r.y + r.h - 20);
  hand(ctx, c, 1, r.x + 24, r.y + r.h - 20);

  // Condition icons along the bottom-right.
  let cxx = r.x + r.w - 12;
  for (const cond of c.conditions) {
    text(ctx, COND_ICON[cond] ?? '?', cxx, r.y + r.h - 16, SWEETIE16.red);
    cxx -= 8;
  }
}

function hand(ctx: CanvasRenderingContext2D, c: Character, index: 0 | 1, x: number, y: number): void {
  drawSlotBox(ctx, x, y, 16);
  const it = c.hands[index];
  if (it) drawItemIcon(ctx, it, x, y, 16);
  else text(ctx, index === 0 ? 'L' : 'R', x + 5, y + 4, COLORS.textDim);

  // Cooldown wipe: darken the top portion in proportion to time remaining.
  const remaining = c.cooldowns[index] ?? 0;
  if (remaining > 0) {
    const full = it?.tpl.cooldownMs ?? 500;
    const ratio = Math.max(0, Math.min(1, remaining / full));
    ctx.fillStyle = 'rgba(26,28,44,0.7)';
    ctx.fillRect(x + 1, y + 1, 14, Math.round(14 * ratio));
  }
}

function bar(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, cur: number, max: number, fill: string): void {
  const ratio = max > 0 ? Math.max(0, Math.min(1, cur / max)) : 0;
  ctx.fillStyle = COLORS.hpBack;
  ctx.fillRect(x, y, w, 8);
  ctx.fillStyle = fill;
  ctx.fillRect(x, y, Math.round(w * ratio), 8);
}

function drawCompass(ctx: CanvasRenderingContext2D, facing: Dir): void {
  const cx = COMPASS.x + COMPASS.w / 2;
  const cy = COMPASS.y + COMPASS.h / 2;
  const marks: { label: string; dir: Dir; dx: number; dy: number }[] = [
    { label: 'N', dir: 0, dx: 0, dy: -12 },
    { label: 'E', dir: 1, dx: 14, dy: -4 },
    { label: 'S', dir: 2, dx: 0, dy: 4 },
    { label: 'W', dir: 3, dx: -18, dy: -4 },
  ];
  for (const m of marks) {
    text(ctx, m.label, cx + m.dx - 2, cy + m.dy, m.dir === facing ? COLORS.compassOn : COLORS.compassOff);
  }
  text(ctx, `facing ${DIR_NAME[facing]}  [I]nv`, COMPASS.x, COMPASS.y + COMPASS.h - 10, COLORS.textDim);
}

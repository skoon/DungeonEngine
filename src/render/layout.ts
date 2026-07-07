/**
 * Screen layout — the single source of truth for pane geometry (plan §2),
 * in the fixed 640x400 internal resolution. Render and input both import
 * from here so the panes and their hit regions can never drift apart.
 */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

// Three panes: viewport top-left, message log below it, party on the right.
export const VIEWPORT: Rect = { x: 0, y: 0, w: 440, h: 290 };
export const LOG: Rect = { x: 0, y: 290, w: 440, h: 110 };
export const PARTY: Rect = { x: 440, y: 0, w: 200, h: 400 };

// Four stacked character cards + a compass, inside the party pane.
export const PARTY_CARDS: Rect[] = [0, 1, 2, 3].map((i) => ({
  x: 445,
  y: 8 + i * 87,
  w: 190,
  h: 82,
}));
export const COMPASS: Rect = { x: 445, y: 358, w: 190, h: 36 };

// Per-card widget rects (kept in sync with partyPanel's drawing offsets, and
// used for click hit-testing in M8).
export function portraitRect(i: number): Rect | null {
  const r = PARTY_CARDS[i];
  return r ? { x: r.x + 4, y: r.y + 4, w: 26, h: 26 } : null;
}
export function handSlotRect(i: number, hand: 0 | 1): Rect | null {
  const r = PARTY_CARDS[i];
  return r ? { x: r.x + 4 + hand * 20, y: r.y + r.h - 20, w: 16, h: 16 } : null;
}

// --- On-screen controls (M8): clickable buttons shared by draw + hit-test.
export type MoveId =
  | 'turnLeft' | 'forward' | 'turnRight'
  | 'strafeLeft' | 'back' | 'strafeRight';
export interface Button<T> {
  id: T;
  rect: Rect;
  label: string;
}

// A WASDQE-shaped movement cluster in the viewport's lower-left. Labelling
// the buttons with their keys doubles as on-screen key hints.
const BW = 18;
const BH = 16;
const PX = 6;
const PY0 = VIEWPORT.y + VIEWPORT.h - 2 * BH - 8; // top row
const PY1 = PY0 + BH + 1;
export const MOVE_BUTTONS: Button<MoveId>[] = [
  { id: 'turnLeft', rect: { x: PX, y: PY0, w: BW, h: BH }, label: 'Q' },
  { id: 'forward', rect: { x: PX + BW + 1, y: PY0, w: BW, h: BH }, label: 'W' },
  { id: 'turnRight', rect: { x: PX + 2 * (BW + 1), y: PY0, w: BW, h: BH }, label: 'E' },
  { id: 'strafeLeft', rect: { x: PX, y: PY1, w: BW, h: BH }, label: 'A' },
  { id: 'back', rect: { x: PX + BW + 1, y: PY1, w: BW, h: BH }, label: 'S' },
  { id: 'strafeRight', rect: { x: PX + 2 * (BW + 1), y: PY1, w: BW, h: BH }, label: 'D' },
];

// Bag / spellbook buttons in the party-pane header.
export type UiId = 'bag' | 'mag';
export const UI_BUTTONS: Button<UiId>[] = [
  { id: 'bag', rect: { x: 556, y: 3, w: 38, h: 11 }, label: 'BAG' },
  { id: 'mag', rect: { x: 596, y: 3, w: 38, h: 11 }, label: 'SPL' },
];

// A close box for the full-screen overlays (640 wide).
export const CLOSE_BUTTON: Rect = { x: 620, y: 3, w: 14, h: 13 };

/** A rect shrunk by `n` px on every side (e.g. a pane's content well). */
export function inset(r: Rect, n: number): Rect {
  return { x: r.x + n, y: r.y + n, w: r.w - 2 * n, h: r.h - 2 * n };
}

export function contains(r: Rect, x: number, y: number): boolean {
  return x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h;
}

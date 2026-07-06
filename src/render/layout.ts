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

/** A rect shrunk by `n` px on every side (e.g. a pane's content well). */
export function inset(r: Rect, n: number): Rect {
  return { x: r.x + n, y: r.y + n, w: r.w - 2 * n, h: r.h - 2 * n };
}

export function contains(r: Rect, x: number, y: number): boolean {
  return x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h;
}

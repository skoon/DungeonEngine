/**
 * Tiny text helper. Everything draws through this so baseline and pixel
 * snapping are consistent. Uses an 8px monospace face for now — a real
 * bitmap font sheet is asset work for a later pass (plan §2.4); rendered
 * into the 640x400 backbuffer and integer-scaled, it still stays crisp.
 */

const FONT = '8px monospace';
export const LINE_HEIGHT = 10;

export function text(
  ctx: CanvasRenderingContext2D,
  str: string,
  x: number,
  y: number,
  color: string,
): void {
  ctx.font = FONT;
  ctx.textBaseline = 'top';
  ctx.fillStyle = color;
  ctx.fillText(str, Math.round(x), Math.round(y));
}

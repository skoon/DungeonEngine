/**
 * Sprite-atlas data model (sprite plan P1/T1.1). Pure functions only — no
 * canvas, no fetch — so validation and animation math are unit-testable in
 * node. The browser-side loader (`sprites.ts`) consumes these.
 *
 * Atlas JSON shape (docs/SPRITE_INTEGRATION_PLAN.md §2):
 *   { "meta": { "image": "walls.png", "size": { "w": 512, "h": 512 } },
 *     "frames": { "brick_front_1": { "x": 0, "y": 0, "w": 100, "h": 100 } } }
 *
 * Animation strips lay frames horizontally; `w` is the TOTAL strip width and
 * must divide evenly by `frames`. `ms` is the per-frame duration.
 */

export interface FrameDef {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Animation strip: number of frames laid out horizontally. */
  frames?: number;
  /** Per-frame duration, milliseconds. */
  ms?: number;
  /** 9-slice border widths (UI chrome). */
  slice_top?: number;
  slice_bottom?: number;
  slice_left?: number;
  slice_right?: number;
}

export interface AtlasDoc {
  meta: { image: string; size: { w: number; h: number }; palette?: string };
  frames: Record<string, FrameDef>;
}

export interface SrcRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Width of a single animation frame (the strip's `w` divided by count). */
export function frameWidth(def: FrameDef): number {
  return def.w / (def.frames ?? 1);
}

/** Which animation frame is showing at wall-clock `nowMs`. */
export function frameIndex(def: FrameDef, nowMs: number): number {
  const count = def.frames ?? 1;
  if (count <= 1) return 0;
  return Math.floor(nowMs / (def.ms ?? 200)) % count;
}

/** Source rectangle of animation frame `index` within the sheet. */
export function frameSrcRect(def: FrameDef, index: number): SrcRect {
  const fw = frameWidth(def);
  return { x: def.x + index * fw, y: def.y, w: fw, h: def.h };
}

export interface SlicePair {
  src: SrcRect;
  dst: SrcRect;
}

/**
 * 9-slice mapping: split the source frame by its slice borders and stretch
 * only the edges/centre into `dst`. Returns up to 9 src→dst pairs (empty
 * slices are skipped). Corners keep their pixel size.
 */
export function nineSliceRects(def: FrameDef, dst: SrcRect): SlicePair[] {
  const t = def.slice_top ?? 0;
  const b = def.slice_bottom ?? 0;
  const l = def.slice_left ?? 0;
  const r = def.slice_right ?? 0;

  const srcXs = [def.x, def.x + l, def.x + def.w - r, def.x + def.w];
  const srcYs = [def.y, def.y + t, def.y + def.h - b, def.y + def.h];
  const dstXs = [dst.x, dst.x + l, dst.x + dst.w - r, dst.x + dst.w];
  const dstYs = [dst.y, dst.y + t, dst.y + dst.h - b, dst.y + dst.h];

  const out: SlicePair[] = [];
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      const src = {
        x: srcXs[col]!,
        y: srcYs[row]!,
        w: srcXs[col + 1]! - srcXs[col]!,
        h: srcYs[row + 1]! - srcYs[row]!,
      };
      const d = {
        x: dstXs[col]!,
        y: dstYs[row]!,
        w: dstXs[col + 1]! - dstXs[col]!,
        h: dstYs[row + 1]! - dstYs[row]!,
      };
      if (src.w > 0 && src.h > 0 && d.w > 0 && d.h > 0) out.push({ src, dst: d });
    }
  }
  return out;
}

/**
 * Structural validation of a parsed atlas document. Returns a list of
 * problems (empty = valid). Guards the art pipeline: every frame must sit
 * inside the sheet, no two frames may overlap, and animation strips must
 * divide evenly. (This check would have caught every defect in the first
 * concept-art JSON drop — see plan §1.1.)
 */
export function validateAtlas(doc: AtlasDoc, label = 'atlas'): string[] {
  const problems: string[] = [];
  const size = doc.meta?.size;
  if (!doc.meta?.image) problems.push(`${label}: meta.image missing`);
  if (!size || !(size.w > 0) || !(size.h > 0)) {
    problems.push(`${label}: meta.size missing or non-positive`);
    return problems; // bounds checks below would be meaningless
  }
  const entries = Object.entries(doc.frames ?? {});
  if (entries.length === 0) problems.push(`${label}: no frames`);

  for (const [name, f] of entries) {
    if (!(f.w > 0) || !(f.h > 0)) problems.push(`${label}/${name}: non-positive size ${f.w}x${f.h}`);
    if (f.x < 0 || f.y < 0 || f.x + f.w > size.w || f.y + f.h > size.h) {
      problems.push(`${label}/${name}: rect (${f.x},${f.y} ${f.w}x${f.h}) outside sheet ${size.w}x${size.h}`);
    }
    if (f.frames !== undefined) {
      if (!Number.isInteger(f.frames) || f.frames < 1) {
        problems.push(`${label}/${name}: frames must be a positive integer`);
      } else if (f.w % f.frames !== 0) {
        problems.push(`${label}/${name}: strip width ${f.w} not divisible by ${f.frames} frames`);
      }
    }
    for (const key of ['slice_top', 'slice_bottom', 'slice_left', 'slice_right'] as const) {
      const v = f[key];
      if (v !== undefined && (v < 0 || v * 2 > (key.includes('top') || key.includes('bottom') ? f.h : f.w))) {
        problems.push(`${label}/${name}: ${key}=${v} out of range for ${f.w}x${f.h}`);
      }
    }
  }

  // Overlap: O(n²) is fine at atlas scale (dozens of frames).
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const [an, a] = entries[i]!;
      const [bn, b] = entries[j]!;
      if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) {
        problems.push(`${label}: frames "${an}" and "${bn}" overlap`);
      }
    }
  }
  return problems;
}

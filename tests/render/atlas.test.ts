import { describe, expect, it } from 'vitest';
import {
  type AtlasDoc,
  frameIndex,
  frameSrcRect,
  frameWidth,
  nineSliceRects,
  validateAtlas,
} from '@/render/atlas';

function doc(frames: AtlasDoc['frames']): AtlasDoc {
  return { meta: { image: 'sheet.png', size: { w: 256, h: 256 } }, frames };
}

describe('animation frame math', () => {
  const strip = { x: 10, y: 20, w: 100, h: 50, frames: 2, ms: 200 };

  it('splits strip width across frames', () => {
    expect(frameWidth(strip)).toBe(50);
    expect(frameWidth({ x: 0, y: 0, w: 16, h: 16 })).toBe(16);
  });

  it('advances frames on the ms clock and wraps', () => {
    expect(frameIndex(strip, 0)).toBe(0);
    expect(frameIndex(strip, 199)).toBe(0);
    expect(frameIndex(strip, 200)).toBe(1);
    expect(frameIndex(strip, 400)).toBe(0); // wrapped
  });

  it('static frames always index 0', () => {
    expect(frameIndex({ x: 0, y: 0, w: 16, h: 16 }, 12345)).toBe(0);
  });

  it('computes the source rect of a given frame', () => {
    expect(frameSrcRect(strip, 0)).toEqual({ x: 10, y: 20, w: 50, h: 50 });
    expect(frameSrcRect(strip, 1)).toEqual({ x: 60, y: 20, w: 50, h: 50 });
  });
});

describe('nine-slice rects', () => {
  const frame = { x: 100, y: 100, w: 24, h: 24, slice_top: 3, slice_bottom: 3, slice_left: 3, slice_right: 3 };

  it('produces 9 pieces for a larger destination', () => {
    const pairs = nineSliceRects(frame, { x: 0, y: 0, w: 100, h: 60 });
    expect(pairs).toHaveLength(9);
    // Top-left corner keeps its pixel size at the destination origin.
    expect(pairs[0]).toEqual({
      src: { x: 100, y: 100, w: 3, h: 3 },
      dst: { x: 0, y: 0, w: 3, h: 3 },
    });
    // Centre stretches to fill the interior.
    const centre = pairs[4]!;
    expect(centre.src).toEqual({ x: 103, y: 103, w: 18, h: 18 });
    expect(centre.dst).toEqual({ x: 3, y: 3, w: 94, h: 54 });
    // Bottom-right corner lands at the destination's far corner.
    const br = pairs[8]!;
    expect(br.dst).toEqual({ x: 97, y: 57, w: 3, h: 3 });
  });

  it('covers the destination exactly with no gaps or overlaps', () => {
    const dst = { x: 5, y: 7, w: 40, h: 30 };
    const pairs = nineSliceRects(frame, dst);
    const area = pairs.reduce((sum, p) => sum + p.dst.w * p.dst.h, 0);
    expect(area).toBe(dst.w * dst.h);
  });
});

describe('validateAtlas', () => {
  it('accepts a well-formed atlas', () => {
    const d = doc({
      a: { x: 0, y: 0, w: 16, h: 16 },
      b: { x: 16, y: 0, w: 32, h: 16, frames: 2, ms: 150 },
    });
    expect(validateAtlas(d)).toEqual([]);
  });

  it('flags frames outside the sheet (the concept-art walls.json bug)', () => {
    const d = doc({ side: { x: 200, y: 0, w: 100, h: 300 } }); // 300 > 256 tall
    expect(validateAtlas(d, 'walls')).toEqual([
      expect.stringContaining('walls/side'),
    ]);
  });

  it('flags overlapping frames', () => {
    const d = doc({
      a: { x: 0, y: 0, w: 20, h: 20 },
      b: { x: 10, y: 10, w: 20, h: 20 },
    });
    expect(validateAtlas(d)).toEqual([expect.stringContaining('overlap')]);
  });

  it('flags strips whose width does not divide by frame count', () => {
    const d = doc({ walk: { x: 0, y: 0, w: 50, h: 20, frames: 3 } });
    expect(validateAtlas(d)).toEqual([expect.stringContaining('not divisible')]);
  });

  it('flags missing meta and empty frames', () => {
    const bad = { meta: { image: '', size: { w: 0, h: 0 } }, frames: {} } as AtlasDoc;
    const problems = validateAtlas(bad);
    expect(problems.some((p) => p.includes('meta.image'))).toBe(true);
    expect(problems.some((p) => p.includes('meta.size'))).toBe(true);
  });

  it('flags oversized slice borders', () => {
    const d = doc({ ui: { x: 0, y: 0, w: 24, h: 24, slice_left: 13 } }); // 13*2 > 24
    expect(validateAtlas(d)).toEqual([expect.stringContaining('slice_left')]);
  });
});

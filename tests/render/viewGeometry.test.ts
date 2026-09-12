import { describe, expect, it } from 'vitest';
import {
  CX, HORIZON, ceilQuad, ceilY, floorQuad, floorY, frontRect, nearDepth, scale, sideQuad,
} from '@/render/viewGeometry';

describe('view geometry projection', () => {
  it('scale shrinks with depth', () => {
    expect(scale(0.5)).toBeGreaterThan(scale(1.5));
    expect(scale(1.5)).toBeGreaterThan(scale(3.5));
  });

  it('front faces are centred and symmetric for lateral 0', () => {
    const r = frontRect(1, 0);
    expect((r.x0 + r.x1) / 2).toBeCloseTo(CX, 5);
  });

  it('front faces shrink and stay symmetric as rows recede', () => {
    const near = frontRect(0, 0);
    const far = frontRect(3, 0);
    expect(near.x1 - near.x0).toBeGreaterThan(far.x1 - far.x0);
    expect(near.y1 - near.y0).toBeGreaterThan(far.y1 - far.y0);
    // Both centred on CX.
    expect((far.x0 + far.x1) / 2).toBeCloseTo(CX, 5);
  });

  it('lateral offset mirrors around the centre line', () => {
    const rl = frontRect(2, -1);
    const rr = frontRect(2, 1);
    expect(rl.x0).toBeCloseTo(2 * CX - rr.x1, 5);
    expect(rl.x1).toBeCloseTo(2 * CX - rr.x0, 5);
  });

  it('walls straddle the horizon (ceiling above, floor below)', () => {
    expect(ceilY(1.5)).toBeLessThan(HORIZON);
    expect(floorY(1.5)).toBeGreaterThan(HORIZON);
  });

  it('side walls recede toward the centre line (near edge is more lateral)', () => {
    const q = sideQuad(1, 0, 'right'); // right edge at e=+0.5
    expect(q.nearX).toBeGreaterThan(q.farX); // near projects further right
    expect(q.farX).toBeGreaterThan(CX);
    // and vertically the far end is shorter
    expect(q.nearBot - q.nearTop).toBeGreaterThan(q.farBot - q.farTop);
  });
});

describe('cell floor/ceiling quads (paving)', () => {
  it('clamps row 0\'s near plane ahead of the eye', () => {
    expect(nearDepth(0)).toBeGreaterThan(0); // true near plane is behind the eye
    expect(nearDepth(1)).toBe(0.5);
    expect(nearDepth(3)).toBe(2.5);
  });

  it('ceiling quad mirrors the floor quad across the horizon', () => {
    const floor = floorQuad(1, 0);
    const ceil = ceilQuad(1, 0);
    ceil.forEach((c, i) => {
      expect(c.x).toBeCloseTo(floor[i]!.x, 5); // same footprint...
      expect(HORIZON - c.y).toBeCloseTo(floor[i]!.y - HORIZON, 5); // ...flipped in y
    });
  });

  it('near edges are wider than far edges (the slab recedes)', () => {
    const [nearL, nearR, farR, farL] = floorQuad(1, 0);
    expect(nearR.x - nearL.x).toBeGreaterThan(farR.x - farL.x);
    expect(nearL.y).toBeGreaterThan(farL.y); // nearer floor sits lower on screen
  });

  it('laterally offset slabs stay adjacent — no gaps or overlap between cells', () => {
    const centre = floorQuad(2, 0);
    const right = floorQuad(2, 1);
    expect(right[0]!.x).toBeCloseTo(centre[1]!.x, 5); // near edges meet
    expect(right[3]!.x).toBeCloseTo(centre[2]!.x, 5); // far edges meet
  });
});

import { describe, expect, it } from 'vitest';
import { CX, HORIZON, ceilY, floorY, frontRect, scale, sideQuad } from '@/render/viewGeometry';

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

import { describe, expect, it } from 'vitest';
import { SWEETIE16 } from '@/render/palette';
import { TILESETS, getTileset } from '@/render/tilesets';
import { rampTone } from '@/render/viewport';

/** Perceived brightness of a palette hex, for ordering checks. */
function luma(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16);
  return 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
}

const PALETTE = new Set<string>(Object.values(SWEETIE16));

describe('tileset ramps', () => {
  const entries = Object.entries(TILESETS);

  it('orders every ramp near -> far, light -> dark', () => {
    // The floor/ceiling ramps were once authored in screen order, which made the
    // paving paint the slab at the party's feet black. Near must outshine far.
    for (const [id, t] of entries) {
      for (const name of ['front', 'side', 'floor', 'ceiling'] as const) {
        const ramp = t[name];
        expect(luma(ramp[0]!), `${id}.${name} near is not lighter than far`).toBeGreaterThan(
          luma(ramp[ramp.length - 1]!),
        );
      }
    }
  });

  it('never repeats a tone back to back, so the paving checker always contrasts', () => {
    for (const [id, t] of entries) {
      for (const name of ['front', 'side', 'floor', 'ceiling'] as const) {
        const ramp = t[name];
        for (let i = 1; i < ramp.length; i++) {
          expect(ramp[i], `${id}.${name}[${i}] repeats its neighbour`).not.toBe(ramp[i - 1]);
        }
      }
    }
  });

  it('keeps every tone inside the shared 16-colour palette', () => {
    for (const [id, t] of entries) {
      for (const tone of [...t.front, ...t.side, ...t.floor, ...t.ceiling, t.mortar, t.door, t.doorTrim]) {
        expect(PALETTE.has(tone), `${id} uses off-palette ${tone}`).toBe(true);
      }
    }
  });

  it('falls back to brick for an unknown tileset id', () => {
    expect(getTileset('no_such_tileset')).toBe(TILESETS.brick);
  });
});

describe('rampTone', () => {
  const ramp = ['a', 'b', 'c', 'd'];

  it('indexes by depth row and clamps out-of-range rows', () => {
    expect(rampTone(ramp, 0, false)).toBe('a');
    expect(rampTone(ramp, 3, false)).toBe('d');
    expect(rampTone(ramp, 9, false)).toBe('d');
    expect(rampTone(ramp, -2, false)).toBe('a');
  });

  it('always returns a different tone for the alternate slab', () => {
    for (let row = 0; row < ramp.length; row++) {
      expect(rampTone(ramp, row, true)).not.toBe(rampTone(ramp, row, false));
    }
  });

  it('steps back inside the ramp at the far end instead of running off it', () => {
    expect(rampTone(ramp, 3, true)).toBe('c');
  });
});

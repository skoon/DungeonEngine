import { describe, expect, it } from 'vitest';
import { Dir } from './grid';
import { isWalkable } from './dungeon';
import { parseMap } from './mapParser';

describe('parseMap', () => {
  it('parses dimensions, floor/solid and the start pose', () => {
    const level = parseMap({
      name: 'demo',
      ascii: `
#####
#..>#
#.#.#
#####
`,
    });
    expect(level.name).toBe('demo');
    expect(level.width).toBe(5);
    expect(level.height).toBe(4);
    expect(level.start).toEqual({ pos: { x: 3, y: 1 }, facing: Dir.E });
    expect(isWalkable(level, 1, 1)).toBe(true); // floor
    expect(isWalkable(level, 2, 2)).toBe(false); // interior pillar '#'
    expect(isWalkable(level, 0, 0)).toBe(false); // border
  });

  it('reads all four start facings', () => {
    for (const [glyph, dir] of [
      ['^', Dir.N],
      ['>', Dir.E],
      ['v', Dir.S],
      ['<', Dir.W],
    ] as const) {
      const level = parseMap({ name: 't', ascii: `###\n#${glyph}#\n###` });
      expect(level.start.facing).toBe(dir);
    }
  });

  it('treats spaces as solid rock', () => {
    const level = parseMap({ name: 't', ascii: '###\n#>#\n# #' });
    expect(isWalkable(level, 1, 2)).toBe(false);
  });

  it('registers edge walls under canonical keys', () => {
    const level = parseMap({
      name: 't',
      ascii: '####\n#>.#\n####',
      edges: [{ x: 1, y: 1, dir: Dir.E }],
    });
    expect(level.edges.size).toBe(1);
    expect(level.edges.get('v:1:1')).toEqual({ blocksMovement: true });
  });

  it('rejects ragged rows', () => {
    expect(() => parseMap({ name: 't', ascii: '####\n#>#\n####' })).toThrow(/width/);
  });

  it('rejects unknown glyphs', () => {
    expect(() => parseMap({ name: 't', ascii: '###\n#Z#\n###' })).toThrow(/unknown/);
  });

  it('rejects a map with no start', () => {
    expect(() => parseMap({ name: 't', ascii: '###\n#.#\n###' })).toThrow(/no party start/);
  });

  it('rejects a map with two starts', () => {
    expect(() => parseMap({ name: 't', ascii: '####\n#>>#\n####' })).toThrow(/multiple/);
  });
});

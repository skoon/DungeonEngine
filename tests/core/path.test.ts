import { describe, expect, it } from 'vitest';
import { Dir } from '@/core/grid';
import { parseMap } from '@/core/mapParser';
import { isAdjacent, manhattan, stepAway, stepToward } from '@/core/path';

const never = () => false;

describe('stepToward', () => {
  it('heads down a corridor toward the target', () => {
    // A straight E-W corridor; from (5,1) toward (1,1) the first step is West.
    const level = parseMap({ name: 'c', ascii: '#######\n#>....#\n#######' });
    const dir = stepToward(level, { x: 5, y: 1 }, { x: 1, y: 1 }, never);
    expect(dir).toBe(Dir.W);
  });

  it('returns null when already adjacent (caller should attack)', () => {
    const level = parseMap({ name: 'c', ascii: '#####\n#>..#\n#####' });
    expect(stepToward(level, { x: 2, y: 1 }, { x: 1, y: 1 }, never)).toBeNull();
  });

  it('routes around a wall', () => {
    // A U-shaped detour: reaching the target needs to go down and around.
    const level = parseMap({
      name: 'u',
      ascii: '#####\n#>#.#\n#...#\n#####',
    });
    // From (3,1) to (1,1): the direct West edge is a wall pillar at (2,1),
    // so the first step must be South.
    const dir = stepToward(level, { x: 3, y: 1 }, { x: 1, y: 1 }, never);
    expect(dir).toBe(Dir.S);
  });

  it('returns null when the target is walled off / out of radius', () => {
    const level = parseMap({ name: 'split', ascii: '#####\n#>#.#\n#####' });
    expect(stepToward(level, { x: 3, y: 1 }, { x: 1, y: 1 }, never)).toBeNull();
  });
});

describe('stepAway and helpers', () => {
  it('moves to the neighbour farthest from the threat', () => {
    const level = parseMap({ name: 'c', ascii: '#######\n#>....#\n#######' });
    // At (3,1) with a threat at (1,1), fleeing East increases distance.
    expect(stepAway(level, { x: 3, y: 1 }, { x: 1, y: 1 }, never)).toBe(Dir.E);
  });

  it('manhattan and isAdjacent', () => {
    expect(manhattan({ x: 1, y: 1 }, { x: 4, y: 1 })).toBe(3);
    expect(isAdjacent({ x: 1, y: 1 }, { x: 1, y: 2 })).toBe(true);
    expect(isAdjacent({ x: 1, y: 1 }, { x: 2, y: 2 })).toBe(false);
  });
});

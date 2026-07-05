import { describe, expect, it } from 'vitest';
import { Dir } from './grid';
import {
  blockReason,
  canEnter,
  edgeBlocks,
  edgeKey,
  inBounds,
  isWalkable,
} from './dungeon';
import { parseMap } from './mapParser';

// 3x3 room, walls all around, party start centre, one thin wall on the East
// side of the centre cell.
const level = parseMap({
  name: 'test',
  ascii: `
###
#>#
###
`,
});

// A 2-cell open corridor with a thin wall between them, for edge tests.
const corridor = parseMap({
  name: 'corridor',
  ascii: `
####
#>.#
####
`,
  edges: [{ x: 1, y: 1, dir: Dir.E }],
});

// Same corridor, no edge wall — for the "open step" case.
const openCorridor = parseMap({
  name: 'open',
  ascii: `
####
#>.#
####
`,
});

describe('dungeon queries', () => {
  it('reports bounds', () => {
    expect(inBounds(level, 0, 0)).toBe(true);
    expect(inBounds(level, -1, 0)).toBe(false);
    expect(inBounds(level, 3, 0)).toBe(false);
  });

  it('centre is floor, border is solid', () => {
    expect(isWalkable(level, 1, 1)).toBe(true);
    expect(isWalkable(level, 0, 0)).toBe(false);
    expect(isWalkable(level, 99, 99)).toBe(false);
  });
});

describe('edge keys are canonical (shared owner)', () => {
  it('North of (x,y) == South of (x,y-1)', () => {
    expect(edgeKey(2, 3, Dir.N)).toBe(edgeKey(2, 2, Dir.S));
  });

  it('East of (x,y) == West of (x+1,y)', () => {
    expect(edgeKey(2, 3, Dir.E)).toBe(edgeKey(3, 3, Dir.W));
  });
});

describe('edge walls block from both sides', () => {
  it('blocks East from (1,1) and West from (2,1) via one spec', () => {
    expect(edgeBlocks(corridor, 1, 1, Dir.E)).toBe(true);
    expect(edgeBlocks(corridor, 2, 1, Dir.W)).toBe(true);
  });

  it('both cells are still walkable — only the edge is closed', () => {
    expect(isWalkable(corridor, 1, 1)).toBe(true);
    expect(isWalkable(corridor, 2, 1)).toBe(true);
  });
});

describe('blockReason distinguishes wall from edge', () => {
  it('solid neighbour -> wall', () => {
    expect(blockReason(level, { x: 1, y: 1 }, Dir.N)).toBe('wall');
  });

  it('thin wall between floors -> edge', () => {
    expect(blockReason(corridor, { x: 1, y: 1 }, Dir.E)).toBe('edge');
  });

  it('shared edge blocks from the far side too', () => {
    expect(blockReason(corridor, { x: 2, y: 1 }, Dir.W)).toBe('edge');
    expect(canEnter(corridor, { x: 2, y: 1 }, Dir.W)).toBe(false);
  });

  it('open step (no edge) -> null', () => {
    expect(blockReason(openCorridor, { x: 1, y: 1 }, Dir.E)).toBe(null);
    expect(canEnter(openCorridor, { x: 1, y: 1 }, Dir.E)).toBe(true);
  });
});

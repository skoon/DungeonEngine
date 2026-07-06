import { describe, expect, it } from 'vitest';
import {
  Dir,
  type Dir as DirType,
  delta,
  opposite,
  translate,
  turnLeft,
  turnRight,
  vecEquals,
} from '@/core/grid';

const ALL: DirType[] = [Dir.N, Dir.E, Dir.S, Dir.W];

describe('grid facing math', () => {
  it('four right turns return to start', () => {
    for (const d of ALL) {
      expect(turnRight(turnRight(turnRight(turnRight(d))))).toBe(d);
    }
  });

  it('turnLeft is the inverse of turnRight', () => {
    for (const d of ALL) expect(turnLeft(turnRight(d))).toBe(d);
  });

  it('opposite is two turns and is self-inverse', () => {
    for (const d of ALL) {
      expect(opposite(d)).toBe(turnRight(turnRight(d)));
      expect(opposite(opposite(d))).toBe(d);
    }
  });

  it('turns go clockwise N->E->S->W', () => {
    expect(turnRight(Dir.N)).toBe(Dir.E);
    expect(turnRight(Dir.E)).toBe(Dir.S);
    expect(turnRight(Dir.S)).toBe(Dir.W);
    expect(turnRight(Dir.W)).toBe(Dir.N);
  });

  it('deltas point the right way (+y is south)', () => {
    expect(delta(Dir.N)).toEqual({ x: 0, y: -1 });
    expect(delta(Dir.E)).toEqual({ x: 1, y: 0 });
    expect(delta(Dir.S)).toEqual({ x: 0, y: 1 });
    expect(delta(Dir.W)).toEqual({ x: -1, y: 0 });
  });

  it('opposite deltas cancel out', () => {
    for (const d of ALL) {
      const there = delta(d);
      const back = delta(opposite(d));
      expect(there.x + back.x).toBe(0);
      expect(there.y + back.y).toBe(0);
    }
  });

  it('translate does not mutate the input', () => {
    const p = { x: 3, y: 4 };
    const moved = translate(p, Dir.E);
    expect(p).toEqual({ x: 3, y: 4 });
    expect(moved).toEqual({ x: 4, y: 4 });
  });

  it('vecEquals compares by value', () => {
    expect(vecEquals({ x: 1, y: 2 }, { x: 1, y: 2 })).toBe(true);
    expect(vecEquals({ x: 1, y: 2 }, { x: 2, y: 1 })).toBe(false);
  });
});

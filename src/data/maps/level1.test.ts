import { describe, expect, it } from 'vitest';
import { Dir, type Vec2 } from '../../core/grid';
import { floorCount, reachableCells } from '../../core/dungeon';
import { parseMap } from '../../core/mapParser';
import { Party, type StepDir, type TurnDir } from '../../core/party';
import { EventBus } from '../../core/events';
import { level1 } from './level1';

const level = parseMap(level1);

describe('level 1 — The Pillared Hall', () => {
  it('parses to the expected shape and start', () => {
    expect(level.width).toBe(13);
    expect(level.height).toBe(9);
    expect(level.start).toEqual({ pos: { x: 1, y: 5 }, facing: Dir.E });
  });

  it('is fully connected — every floor cell is reachable from the start', () => {
    const reached = reachableCells(level, level.start.pos);
    expect(reached.size).toBe(floorCount(level));
  });

  it('has the demo edge wall between two open floor cells', () => {
    // (1,1) and (2,1) are both floor, but stepping between them is blocked.
    const party = new Party(level, new EventBus(), { pos: { x: 1, y: 1 }, facing: Dir.E });
    expect(party.stepForward()).toBe(false); // edge wall
    expect(party.getPose().pos).toEqual({ x: 1, y: 1 });
  });
});

/**
 * Move-script interpreter: F/B forward/back, L/R strafe, l/r turn.
 * Records the party position after every token — the scripted-walk proof
 * that movement over the real level behaves as designed (plan M1 "done when").
 */
function walk(party: Party, script: string): Vec2[] {
  const trail: Vec2[] = [];
  for (const token of script) {
    switch (token) {
      case 'F':
      case 'B':
      case 'L':
      case 'R':
        party.step(({ F: 'forward', B: 'back', L: 'left', R: 'right' } as Record<string, StepDir>)[token]!);
        break;
      case 'l':
      case 'r':
        party.turn(({ l: 'left', r: 'right' } as Record<string, TurnDir>)[token]!);
        break;
      default:
        throw new Error(`bad script token '${token}'`);
    }
    const p = party.getPose().pos;
    trail.push({ x: p.x, y: p.y });
  }
  return trail;
}

describe('scripted walk over level 1', () => {
  it('follows the intended path and stops at the north wall', () => {
    const party = new Party(level, new EventBus());
    // FF east to the col-3 vertical corridor (odd cols are the through
    // corridors; even cols are pillars), turn north, run to the top wall
    // (last F bumps the border and is a no-op), turn east, two steps.
    const trail = walk(party, 'FFlFFFFFrFF');
    expect(trail).toEqual([
      { x: 2, y: 5 }, // F
      { x: 3, y: 5 }, // F  (col 3 — a vertical corridor)
      { x: 3, y: 5 }, // l  (turn north, no move)
      { x: 3, y: 4 }, // F
      { x: 3, y: 3 }, // F
      { x: 3, y: 2 }, // F
      { x: 3, y: 1 }, // F
      { x: 3, y: 1 }, // F bumps the north border — no move
      { x: 3, y: 1 }, // r (turn east, no move)
      { x: 4, y: 1 }, // F
      { x: 5, y: 1 }, // F
    ]);
    expect(party.getPose().pos).toEqual({ x: 5, y: 1 });
    expect(party.getPose().facing).toBe(Dir.E);
  });
});

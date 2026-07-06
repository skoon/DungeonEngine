import { describe, expect, it, vi } from 'vitest';
import { Dir } from '@/core/grid';
import { EventBus, type GameEvent } from '@/core/events';
import { parseMap } from '@/core/mapParser';
import { Party, stepDirection, tryStep, turned } from '@/core/party';

// 3x3 open room, start dead centre facing East.
const room = parseMap({
  name: 'room',
  ascii: `
#####
#...#
#.>.#
#...#
#####
`,
});

const corridor = parseMap({
  name: 'corridor',
  ascii: '####\n#>.#\n####',
  edges: [{ x: 1, y: 1, dir: Dir.E }],
});

describe('stepDirection', () => {
  it('resolves relative steps against facing East', () => {
    expect(stepDirection(Dir.E, 'forward')).toBe(Dir.E);
    expect(stepDirection(Dir.E, 'back')).toBe(Dir.W);
    expect(stepDirection(Dir.E, 'left')).toBe(Dir.N);
    expect(stepDirection(Dir.E, 'right')).toBe(Dir.S);
  });

  it('strafe-left off North is West', () => {
    expect(stepDirection(Dir.N, 'left')).toBe(Dir.W);
  });
});

describe('tryStep (pure)', () => {
  const start = { pos: { x: 2, y: 2 }, facing: Dir.E };

  it('moves forward and preserves facing', () => {
    const r = tryStep(room, start, 'forward');
    expect(r).toEqual({ ok: true, pose: { pos: { x: 3, y: 2 }, facing: Dir.E } });
  });

  it('strafes without changing facing', () => {
    const r = tryStep(room, start, 'left');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.pose.pos).toEqual({ x: 2, y: 1 });
      expect(r.pose.facing).toBe(Dir.E);
    }
  });

  it('is blocked by solid rock with reason wall', () => {
    const atWall = { pos: { x: 1, y: 1 }, facing: Dir.N };
    const r = tryStep(room, atWall, 'forward');
    expect(r).toEqual({ ok: false, reason: 'wall', pose: atWall });
  });

  it('is blocked by a thin wall with reason edge', () => {
    const r = tryStep(corridor, { pos: { x: 1, y: 1 }, facing: Dir.E }, 'forward');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('edge');
  });

  it('does not mutate the input pose', () => {
    const pose = { pos: { x: 2, y: 2 }, facing: Dir.E };
    tryStep(room, pose, 'forward');
    expect(pose).toEqual({ pos: { x: 2, y: 2 }, facing: Dir.E });
  });
});

describe('turned (pure)', () => {
  it('rotates facing, keeps position', () => {
    expect(turned({ pos: { x: 4, y: 5 }, facing: Dir.N }, 'right')).toEqual({
      pos: { x: 4, y: 5 },
      facing: Dir.E,
    });
    expect(turned({ pos: { x: 4, y: 5 }, facing: Dir.N }, 'left')).toEqual({
      pos: { x: 4, y: 5 },
      facing: Dir.W,
    });
  });
});

describe('Party controller emits events', () => {
  function harness(level = room) {
    const bus = new EventBus();
    const events: GameEvent[] = [];
    bus.onAny((e) => events.push(e));
    return { party: new Party(level, bus), events };
  }

  it('starts at the level start pose', () => {
    const { party } = harness();
    expect(party.getPose()).toEqual({ pos: { x: 2, y: 2 }, facing: Dir.E });
  });

  it('emits party/moved on a successful step', () => {
    const { party, events } = harness();
    expect(party.stepForward()).toBe(true);
    expect(events).toEqual([
      { type: 'party/moved', x: 3, y: 2, facing: Dir.E, fromX: 2, fromY: 2 },
    ]);
    expect(party.getPose().pos).toEqual({ x: 3, y: 2 });
  });

  it('emits party/blocked and does not move into a wall', () => {
    const { party, events } = harness();
    party.turnRight(); // now facing South... walk to a wall
    party.step('forward'); // (2,3)
    party.step('forward'); // blocked by border at (2,4)
    const blocked = events.filter((e) => e.type === 'party/blocked');
    expect(blocked).toEqual([{ type: 'party/blocked', reason: 'wall', facing: Dir.S }]);
    expect(party.getPose().pos).toEqual({ x: 2, y: 3 });
  });

  it('emits party/turned and leaves position unchanged', () => {
    const { party, events } = harness();
    party.turnLeft();
    expect(party.getPose()).toEqual({ pos: { x: 2, y: 2 }, facing: Dir.N });
    expect(events).toEqual([{ type: 'party/turned', facing: Dir.N }]);
  });

  it('emits party/blocked with reason edge against a thin wall', () => {
    const bus = new EventBus();
    const blocked = vi.fn();
    bus.on('party/blocked', blocked);
    new Party(corridor, bus).stepForward();
    expect(blocked).toHaveBeenCalledWith({ type: 'party/blocked', reason: 'edge', facing: Dir.E });
  });
});

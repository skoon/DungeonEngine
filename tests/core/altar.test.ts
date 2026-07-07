import { describe, expect, it } from 'vitest';
import { EventBus } from '@/core/events';
import { parseMap } from '@/core/mapParser';
import { Rng } from '@/core/rng';
import { Roster } from '@/core/roster';
import { World } from '@/core/world';
import { defaultParty } from '@/data/party';

function setup() {
  const bus = new EventBus();
  const level = parseMap({ name: 'shrine', ascii: '#####\n#>..#\n#####', triggers: [{ x: 2, y: 1, kind: 'altar' }] });
  const roster = new Roster(defaultParty());
  const world = new World(level, bus, new Rng(1), roster);
  const log: string[] = [];
  bus.on('log/message', (e) => log.push(e.text));
  return { world, roster, log };
}

describe('resurrection altar (M10)', () => {
  it('revives a fallen member on entry', () => {
    const { world, roster, log } = setup();
    roster.member(0)!.hp.cur = 0;
    roster.member(0)!.conditions.add('unconscious');
    world.stepForward(); // step onto the altar at (2,1)
    expect(roster.member(0)!.hp.cur).toBeGreaterThan(0);
    expect(roster.member(0)!.conditions.has('unconscious')).toBe(false);
    expect(log.some((l) => /rise again/i.test(l))).toBe(true);
  });

  it('does nothing but glow when no one is down', () => {
    const { world, roster, log } = setup();
    const before = roster.members.map((c) => c.hp.cur);
    world.stepForward();
    expect(roster.members.map((c) => c.hp.cur)).toEqual(before);
    expect(log.some((l) => /none here need/i.test(l))).toBe(true);
  });
});

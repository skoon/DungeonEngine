import { describe, expect, it } from 'vitest';
import { EventBus } from '@/core/events';
import { parseMap } from '@/core/mapParser';
import { Rng } from '@/core/rng';
import { Roster } from '@/core/roster';
import { World } from '@/core/world';
import type { MonsterSpecies } from '@/core/monster';
import type { WanderConfig } from '@/core/dungeon';
import { defaultParty } from '@/data/party';

// A harmless target: never moves, never attacks, never wakes — so wander
// spawns are the only thing changing the monster count.
function dummy(): MonsterSpecies {
  return {
    id: 'd', name: 'Dummy', glyph: 'D', color: '#fff', maxHp: 99, ac: 99, attackBonus: 0,
    damage: [0, 0], moveMs: 99999, attackMs: 99999, sight: 0, xp: 1, ai: 'dumb',
  };
}

// A 7x7 room so findSpawnSpot has walkable cells 2–4 away from the centre.
const ROOM = '#######\n#.....#\n#.....#\n#..>..#\n#.....#\n#.....#\n#######';

function setup(wander?: WanderConfig) {
  const bus = new EventBus();
  const level = parseMap({
    name: 'grind', ascii: ROOM,
    monsters: [{ x: 1, y: 1, species: dummy() }], // seeds the wander pool
    ...(wander ? { wander } : {}),
  });
  const world = new World(level, bus, new Rng(7), new Roster(defaultParty()));
  return world;
}

describe('grind loop (M12)', () => {
  it('restocks wanderers up to the cap, never beyond', () => {
    const world = setup({ maxAlive: 3, everyMs: 1000 });
    let peak = world.monsters.length;
    for (let i = 0; i < 200; i++) {
      world.tick(100);
      peak = Math.max(peak, world.monsters.length);
      expect(world.monsters.length).toBeLessThanOrEqual(3); // cap holds every tick
    }
    expect(peak).toBe(3); // it actually fills up to the cap
  });

  it('does not spawn wanderers on a level without the config', () => {
    const world = setup(); // no wander
    for (let i = 0; i < 200; i++) world.tick(100);
    expect(world.monsters.length).toBe(1); // only the original dummy
  });

  it('respects the spawn cadence', () => {
    const world = setup({ maxAlive: 5, everyMs: 1000 });
    world.tick(100); // 100ms elapsed — no spawn yet
    expect(world.monsters.length).toBe(1);
    for (let i = 0; i < 10; i++) world.tick(100); // cross 1000ms
    expect(world.monsters.length).toBe(2); // exactly one wanderer after one interval
  });
});

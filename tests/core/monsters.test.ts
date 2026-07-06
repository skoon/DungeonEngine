import { describe, expect, it, vi } from 'vitest';
import { EventBus } from '@/core/events';
import { parseMap, type MapSource } from '@/core/mapParser';
import { Rng } from '@/core/rng';
import { Roster } from '@/core/roster';
import { World } from '@/core/world';
import type { MonsterSpecies } from '@/core/monster';
import { SKELETON } from '@/data/monsters';
import { defaultParty } from '@/data/party';

function species(over: Partial<MonsterSpecies>): MonsterSpecies {
  return {
    id: 't', name: 'Test', glyph: 'T', color: '#fff',
    maxHp: 10, ac: 12, attackBonus: 2, damage: [1, 4],
    moveMs: 900, attackMs: 1000, sight: 8, xp: 5, ai: 'dumb',
    ...over,
  };
}

function setup(source: MapSource, seed = 1) {
  const level = parseMap(source);
  const bus = new EventBus();
  const roster = new Roster(defaultParty());
  const world = new World(level, bus, new Rng(seed), roster);
  return { world, roster, bus };
}

describe('monster AI', () => {
  it('a skeleton spots the party and closes in', () => {
    const { world } = setup({
      name: 'hall',
      ascii: '#########\n#>......#\n#########',
      monsters: [{ x: 7, y: 1, species: SKELETON }],
    });
    for (let i = 0; i < 40; i++) world.tick(200);
    const m = world.monsters[0]!;
    expect(m.pos.x).toBeLessThan(7); // moved toward the party at (1,1)
    expect(m.state).not.toBe('idle');
  });

  it('a wounded kobold flees away from the party', () => {
    const { world } = setup({
      name: 'hall',
      ascii: '##########\n#>.......#\n##########',
      monsters: [{ x: 3, y: 1, species: species({ ai: 'smart', fleeBelow: 0.5, maxHp: 6, moveMs: 400 }) }],
    });
    world.monsters[0]!.hp.cur = 1; // badly hurt -> should flee
    for (let i = 0; i < 20; i++) world.tick(200);
    expect(world.monsters[0]!.pos.x).toBeGreaterThan(3);
  });
});

describe('combat', () => {
  it('the party can destroy a monster and gain XP', () => {
    const { world, roster } = setup({
      name: 'duel',
      ascii: '#####\n#>..#\n#####',
      monsters: [{ x: 2, y: 1, species: species({ ac: -100, maxHp: 1, xp: 7 }) }],
    });
    let tries = 0;
    while (world.monsters.length > 0 && tries++ < 30) {
      world.attack(0);
      world.tick(1000); // clear the hand cooldown
    }
    expect(world.monsters).toHaveLength(0);
    expect(roster.members[0]!.xp).toBe(7);
  });

  it('a monster in the way blocks movement (attack it instead)', () => {
    const { world } = setup({
      name: 'block',
      ascii: '#####\n#>..#\n#####',
      monsters: [{ x: 2, y: 1, species: species({}) }],
    });
    expect(world.stepForward()).toBe(false);
    expect(world.party.getPose().pos).toEqual({ x: 1, y: 1 });
  });

  it('an adjacent monster wounds the party over time', () => {
    const { world, roster } = setup({
      name: 'bite',
      ascii: '#####\n#>..#\n#####',
      monsters: [{ x: 2, y: 1, species: species({ attackBonus: 100, damage: [1, 4] }) }],
    });
    const before = roster.members.reduce((s, c) => s + c.hp.cur, 0);
    for (let i = 0; i < 40; i++) world.tick(200);
    const after = roster.members.reduce((s, c) => s + c.hp.cur, 0);
    expect(after).toBeLessThan(before);
  });

  it('wipes the party when the last member falls', () => {
    const { world, roster, bus } = setup({
      name: 'doom',
      ascii: '#####\n#>..#\n#####',
      monsters: [{ x: 2, y: 1, species: species({ attackBonus: 100, damage: [10, 10] }) }],
    });
    const wiped = vi.fn();
    bus.on('party/wiped', wiped);
    // Everyone but one is already down; the monster finishes the job.
    roster.members.forEach((c, i) => { if (i > 0) { c.hp.cur = 0; c.conditions.add('unconscious'); } });
    roster.members[0]!.hp.cur = 1;
    for (let i = 0; i < 60 && wiped.mock.calls.length === 0; i++) world.tick(200);
    expect(wiped).toHaveBeenCalled();
  });
});

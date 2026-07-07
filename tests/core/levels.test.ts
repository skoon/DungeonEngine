import { describe, expect, it } from 'vitest';
import { Dir } from '@/core/grid';
import { cellAt } from '@/core/dungeon';
import { EventBus } from '@/core/events';
import { parseMap } from '@/core/mapParser';
import { Rng } from '@/core/rng';
import { Roster } from '@/core/roster';
import { World } from '@/core/world';
import type { MonsterSpecies } from '@/core/monster';
import { defaultParty } from '@/data/party';
import { item } from '@/data/items';

function weak(): MonsterSpecies {
  return {
    id: 'w', name: 'Wisp', glyph: 'w', color: '#fff', maxHp: 1, ac: -100, attackBonus: 0,
    damage: [1, 1], moveMs: 9999, attackMs: 9999, sight: 1, xp: 1, ai: 'dumb',
  };
}

function build(l1: Parameters<typeof parseMap>[0], l2: Parameters<typeof parseMap>[0]) {
  const bus = new EventBus();
  const levels = [parseMap(l1), parseMap(l2)];
  const roster = new Roster(defaultParty());
  const world = new World(levels, bus, new Rng(1), roster);
  return { world, roster, bus, levels };
}

describe('pit drops to the level below', () => {
  it('falls to the linked cell, hurt', () => {
    const { world, roster } = build(
      { name: 'L1', ascii: '#####\n#>..#\n#####', triggers: [{ x: 2, y: 1, kind: 'pit', link: { level: 1, pos: { x: 1, y: 1 }, facing: Dir.E } }] },
      { name: 'L2', ascii: '#####\n#>..#\n#####' },
    );
    const hpBefore = roster.members.reduce((s, c) => s + c.hp.cur, 0);
    world.stepForward(); // onto the pit at (2,1)
    expect(world.levelIndex).toBe(1);
    expect(world.party.getPose().pos).toEqual({ x: 1, y: 1 });
    expect(roster.members.reduce((s, c) => s + c.hp.cur, 0)).toBeLessThan(hpBefore);
  });
});

describe('stairs link levels both ways', () => {
  it('descends and ascends', () => {
    const { world } = build(
      { name: 'L1', ascii: '#####\n#>..#\n#####', triggers: [{ x: 2, y: 1, kind: 'stairs', link: { level: 1, pos: { x: 2, y: 1 }, facing: Dir.W } }] },
      { name: 'L2', ascii: '#####\n#>..#\n#####', triggers: [{ x: 2, y: 1, kind: 'stairs', link: { level: 0, pos: { x: 1, y: 1 }, facing: Dir.E } }] },
    );
    world.stepForward(); // L1 (1,1)->(2,1) stairs down -> L2 (2,1) facing West
    expect(world.levelIndex).toBe(1);
    expect(world.party.getPose().pos).toEqual({ x: 2, y: 1 });
    // Arrival doesn't auto-trigger; step off the stairs, then back on to ascend.
    world.stepForward(); // West to (1,1)
    world.turnLeft(); world.turnLeft(); // face East
    world.stepForward(); // (1,1)->(2,1) onto the stairs -> back to L1
    expect(world.levelIndex).toBe(0);
    expect(world.party.getPose().pos).toEqual({ x: 1, y: 1 });
  });
});

describe('per-level state persists across a round trip', () => {
  it('keeps dead monsters dead and dropped items in place', () => {
    const { world, levels } = build(
      { name: 'L1', ascii: '#####\n#>..#\n#####', monsters: [{ x: 3, y: 1, species: weak() }] },
      { name: 'L2', ascii: '###\n#>#\n###' },
    );
    // Kill the L1 monster.
    for (let i = 0; i < 20 && world.monsters.length > 0; i++) {
      // face/throw isn't needed — walk adjacent and melee.
      const m = world.monsters[0]!;
      const p = world.party.getPose().pos;
      if (Math.abs(m.pos.x - p.x) + Math.abs(m.pos.y - p.y) === 1) world.attack(0);
      else world.stepForward();
      world.tick(1000);
    }
    expect(world.monsters).toHaveLength(0);
    // Drop an item on the current L1 cell.
    const p = world.party.getPose().pos;
    cellAt(levels[0]!, p.x, p.y)!.items = [item('gem')];

    world.changeLevel(1, { x: 1, y: 1 });
    expect(world.levelIndex).toBe(1);
    world.changeLevel(0, { x: p.x, y: p.y });

    expect(world.monsters).toHaveLength(0); // stayed dead
    expect(cellAt(world.level, p.x, p.y)!.items).toHaveLength(1); // stayed dropped
  });
});

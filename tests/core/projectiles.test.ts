import { describe, expect, it } from 'vitest';
import { Dir } from '@/core/grid';
import { EventBus } from '@/core/events';
import { parseMap, type MapSource } from '@/core/mapParser';
import { Rng } from '@/core/rng';
import { Roster } from '@/core/roster';
import { World } from '@/core/world';
import type { MonsterSpecies } from '@/core/monster';
import { defaultParty } from '@/data/party';

function species(over: Partial<MonsterSpecies>): MonsterSpecies {
  return {
    id: 't', name: 'Target', glyph: 'T', color: '#fff',
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
  return { world, roster, bus, level };
}

/** Deterministic stand-in for Rng: every d20 roll and damage roll is fixed,
 * so hit/kill outcomes in a test never depend on a seed's luck (mirrors the
 * `fake()` helper in combat.test.ts). */
function fakeRng(d20: number, diceSum: number): Rng {
  return { int: () => d20, dice: () => diceSum } as unknown as Rng;
}

describe('thrown weapons', () => {
  it('a thrown dagger with no adjacent target becomes a projectile', () => {
    const { world, roster } = setup({ name: 'hall', ascii: '#########\n#>......#\n#########' });
    // Pip (index 3) holds a dagger (thrown) in hand 0.
    world.attack(3);
    expect(world.projectiles).toHaveLength(1);
    expect(roster.members[3]!.hands[0]).toBeNull(); // it's in the air
  });

  it('lands on the floor and can be retrieved after missing everything', () => {
    const { world, level } = setup({ name: 'hall', ascii: '#####\n#>..#\n#####' });
    world.attack(3); // throws down a 2-cell corridor, hits the far wall
    for (let i = 0; i < 20 && world.projectiles.length > 0; i++) world.tick(50);
    expect(world.projectiles).toHaveLength(0);
    const landedSomewhere = level.cells.some((c) => c.items?.some((it) => it.tpl.id === 'dagger'));
    expect(landedSomewhere).toBe(true);
  });

  it('hits and damages a monster in its path, then drops on that cell', () => {
    const level = parseMap({
      name: 'range',
      ascii: '#######\n#>....#\n#######',
      monsters: [{ x: 4, y: 1, species: species({ ac: -100, maxHp: 3 }) }],
    });
    const bus = new EventBus();
    const roster = new Roster(defaultParty());
    const world = new World(level, bus, fakeRng(15, 6), roster); // guaranteed hit, 6 dmg
    world.attack(3); // Pip throws
    for (let i = 0; i < 20 && world.projectiles.length > 0; i++) world.tick(50);
    expect(world.monsters).toHaveLength(0); // killed
    expect(level.cells[1 * 7 + 4]?.items?.some((it) => it.tpl.id === 'dagger')).toBe(true);
  });

  it('adjacent monsters are still meleed, not thrown at', () => {
    const { world, roster } = setup({
      name: 'melee',
      ascii: '#####\n#>..#\n#####',
      monsters: [{ x: 2, y: 1, species: species({ ac: -100, maxHp: 100 }) }],
    });
    world.attack(3);
    expect(world.projectiles).toHaveLength(0); // melee'd, not thrown
    expect(roster.members[3]!.hands[0]).not.toBeNull(); // dagger stays in hand
  });

  it('the back rank may throw without needing reach', () => {
    const { world, roster } = setup({ name: 'hall', ascii: '#########\n#>......#\n#########' });
    // Sable is index 2 (back rank) and carries a dagger in her backpack, not
    // a hand — move it to a hand first to exercise the throw path.
    const sable = roster.member(2)!;
    sable.hands[0] = sable.backpack[0]!;
    sable.backpack[0] = null;
    world.attack(2);
    expect(world.projectiles).toHaveLength(1);
  });
});

describe('magic missile', () => {
  it('always hits and kills a fragile target', () => {
    const { world } = setup({
      name: 'range',
      ascii: '#######\n#>....#\n#######',
      monsters: [{ x: 4, y: 1, species: species({ ac: 999, maxHp: 1 }) }], // AC would normally never be hit
    });
    world.cast(2, 'magic_missile'); // Sable
    for (let i = 0; i < 20 && world.projectiles.length > 0; i++) world.tick(50);
    expect(world.monsters).toHaveLength(0);
  });

  it('spends mana and sets the caster on cooldown', () => {
    const { world, roster } = setup({ name: 'hall', ascii: '#########\n#>......#\n#########' });
    const sable = roster.member(2)!;
    const mpBefore = sable.mp.cur;
    world.cast(2, 'magic_missile');
    expect(sable.mp.cur).toBe(mpBefore - 3);
    expect(sable.spellCooldown).toBeGreaterThan(0);
  });

  it('refuses when mana is insufficient', () => {
    const { world, roster, bus } = setup({ name: 'hall', ascii: '#########\n#>......#\n#########' });
    const sable = roster.member(2)!;
    sable.mp.cur = 0;
    const log: string[] = [];
    bus.on('log/message', (e) => log.push(e.text));
    world.cast(2, 'magic_missile');
    expect(world.projectiles).toHaveLength(0);
    expect(log.some((l) => /lacks the mana/i.test(l))).toBe(true);
  });
});

describe('burning hands cone', () => {
  it('hits monsters across the row directly ahead', () => {
    // Party starts at (1,2) facing East; forward=(1,0), right=South, so the
    // row-1 cone (lat -1,0,1) lands on (2,1), (2,2), (2,3).
    const level = parseMap({
      name: 'room',
      ascii: '#######\n#.....#\n#>....#\n#.....#\n#######',
      monsters: [
        { x: 2, y: 1, species: species({ ac: -100, maxHp: 1 }) },
        { x: 2, y: 2, species: species({ ac: -100, maxHp: 1 }) },
        { x: 2, y: 3, species: species({ ac: -100, maxHp: 1 }) },
      ],
    });
    const bus = new EventBus();
    const roster = new Roster(defaultParty());
    const world = new World(level, bus, fakeRng(15, 4), roster); // guaranteed hits
    world.cast(2, 'burning_hands'); // Sable
    world.tick(0); // prune the three kills resolved during the cast
    expect(world.monsters).toHaveLength(0);
  });
});

describe('shield buff', () => {
  it('raises AC for its duration then expires', () => {
    const { world, roster } = setup({ name: 'hall', ascii: '#########\n#>......#\n#########' });
    const bram = roster.member(1)!;
    const before = bram.buff;
    world.cast(1, 'shield');
    expect(bram.buff).not.toBe(before);
    expect(bram.buff?.acBonus).toBe(4);
    world.tick(20000); // longer than buffMs
    expect(bram.buff).toBeNull();
  });
});

describe('cure wounds', () => {
  it('heals the neediest ally and revives an unconscious one', () => {
    const { world, roster, bus } = setup({ name: 'hall', ascii: '#########\n#>......#\n#########' });
    roster.member(0)!.hp.cur = 0;
    roster.member(0)!.conditions.add('unconscious');
    const log: string[] = [];
    bus.on('log/message', (e) => log.push(e.text));
    world.cast(1, 'cure_wounds'); // Bram heals
    expect(roster.member(0)!.hp.cur).toBeGreaterThan(0);
    expect(roster.member(0)!.conditions.has('unconscious')).toBe(false);
    expect(log.some((l) => /stirs awake/i.test(l))).toBe(true);
  });

  it('declines without cost when no one is hurt', () => {
    const { world, roster } = setup({ name: 'hall', ascii: '#########\n#>......#\n#########' });
    const bram = roster.member(1)!;
    const mpBefore = bram.mp.cur;
    world.cast(1, 'cure_wounds');
    expect(bram.mp.cur).toBe(mpBefore); // no mana spent
  });
});

describe('light', () => {
  it('activates and decays over time', () => {
    const { world, roster } = setup({ name: 'hall', ascii: '#########\n#>......#\n#########' });
    expect(world.isLit()).toBe(false);
    world.cast(1, 'light'); // Bram
    void roster;
    expect(world.isLit()).toBe(true);
    world.tick(70000);
    expect(world.isLit()).toBe(false);
  });
});

describe('detect secret', () => {
  it('marks nearby illusions and secret doors as detected', () => {
    const { world, level } = setup({
      name: 'secret',
      ascii: '#####\n#>..#\n#####',
      edges: [
        { x: 2, y: 1, dir: Dir.N, kind: 'illusion' },
        { x: 2, y: 1, dir: Dir.S, kind: 'door', secret: true },
      ],
    });
    world.cast(2, 'detect_secret'); // Sable
    const [illusionKey, secretKey] = [
      Array.from(level.edges.entries()).find(([, e]) => e.kind === 'illusion'),
      Array.from(level.edges.entries()).find(([, e]) => e.door?.secret),
    ];
    expect(illusionKey?.[1].detected).toBe(true);
    expect(secretKey?.[1].detected).toBe(true);
  });
});

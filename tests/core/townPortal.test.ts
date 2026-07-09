import { describe, expect, it } from 'vitest';
import { Dir } from '@/core/grid';
import { EventBus } from '@/core/events';
import { parseMap, type MapSource } from '@/core/mapParser';
import type { MonsterSpecies } from '@/core/monster';
import { Rng } from '@/core/rng';
import { Roster } from '@/core/roster';
import { World } from '@/core/world';
import { defaultParty } from '@/data/party';

const DUNGEON: MapSource = { name: 'Dungeon', ascii: '#####\n#>..#\n#####' };
const TOWN: MapSource = { name: 'Town', ascii: '#####\n#>..#\n#####' };
const TOWN_INDEX = 1;
const TOWN_ENTRANCE = { pos: { x: 1, y: 1 }, facing: Dir.E };

const BRUTE: MonsterSpecies = {
  id: 'brute', name: 'Brute', glyph: 'B', color: '#fff', maxHp: 99, ac: 20,
  attackBonus: 0, damage: [1, 1], moveMs: 9999, attackMs: 9999, sight: 9, xp: 1, ai: 'dumb',
};

function build(monsters?: MapSource['monsters']) {
  const bus = new EventBus();
  const dungeon: MapSource = monsters ? { ...DUNGEON, monsters } : DUNGEON;
  const levels = [parseMap(dungeon), parseMap(TOWN)];
  const roster = new Roster(defaultParty());
  const world = new World(levels, bus, new Rng(1), roster);
  world.setTown(TOWN_INDEX, TOWN_ENTRANCE.pos, TOWN_ENTRANCE.facing);
  roster.member(1)!.mp.cur = 20; // ensure the cleric can afford the cast
  const log: string[] = [];
  bus.on('log/message', (e) => log.push(e.text));
  return { world, roster, bus, log };
}

describe('Town Portal (M-DR3)', () => {
  it('whisks the party to town from a safe cell and spends mana', () => {
    const { world, roster } = build();
    const mp = roster.member(1)!.mp.cur;
    world.stepForward(); // now at (2,1) on the dungeon
    world.cast(1, 'town_portal');
    expect(world.levelIndex).toBe(TOWN_INDEX);
    expect(world.party.getPose()).toEqual(TOWN_ENTRANCE);
    expect(roster.member(1)!.mp.cur).toBe(mp - 6);
    expect(roster.member(1)!.spellCooldown).toBeGreaterThan(0);
  });

  it('refuses to cast while a monster is attacking, spending nothing', () => {
    const { world, roster, log } = build([{ x: 3, y: 1, species: BRUTE }]);
    world.stepForward(); // adjacent to the brute; it will turn to attack
    world.tick(100); // let the brute enter its hunt/attack state
    const mp = roster.member(1)!.mp.cur;
    world.cast(1, 'town_portal');
    expect(world.levelIndex).toBe(0); // still in the dungeon
    expect(roster.member(1)!.mp.cur).toBe(mp); // no mana spent
    expect(log.some((l) => /portal/i.test(l))).toBe(true);
  });

  it('returnFromTown restores the exact recall pose, then is spent', () => {
    const { world } = build();
    world.stepForward(); // recall anchor will be (2,1) facing E
    const anchor = world.party.getPose();
    world.cast(1, 'town_portal');
    expect(world.levelIndex).toBe(TOWN_INDEX);
    world.returnFromTown();
    expect(world.levelIndex).toBe(0);
    expect(world.party.getPose()).toEqual(anchor);
    // Anchor is one-shot: a second return has nowhere to go.
    world.returnFromTown();
    expect(world.levelIndex).toBe(0);
  });

  it('persists the recall anchor across a snapshot round-trip', () => {
    const { world } = build();
    world.stepForward();
    const anchor = world.party.getPose();
    world.cast(1, 'town_portal'); // in town, anchor stored

    const snap = world.snapshot();
    const dst = build();
    dst.world.applySnapshot(snap, {
      item: () => { throw new Error('no items'); },
      species: () => BRUTE,
    });
    expect(dst.world.levelIndex).toBe(TOWN_INDEX);
    dst.world.returnFromTown();
    expect(dst.world.levelIndex).toBe(0);
    expect(dst.world.party.getPose()).toEqual(anchor);
  });
});

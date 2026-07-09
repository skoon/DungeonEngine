import { describe, expect, it, vi } from 'vitest';
import { EventBus } from '@/core/events';
import { parseMap, type MapSource } from '@/core/mapParser';
import type { MonsterSpecies } from '@/core/monster';
import { Rng } from '@/core/rng';
import { Roster } from '@/core/roster';
import { World } from '@/core/world';
import { defaultParty } from '@/data/party';
import { serialize, deserialize } from '@/save/save';

/** A trivially-killable dummy that always drops exactly 5 gold. */
const COIN_SLIME: MonsterSpecies = {
  id: 'coin_slime', name: 'Coin Slime', glyph: 'o', color: '#ffcd75',
  maxHp: 1, ac: -100, attackBonus: 0, damage: [1, 1], moveMs: 9999, attackMs: 9999,
  sight: 1, xp: 1, ai: 'dumb', gold: [5, 5],
};

describe('Roster gold purse', () => {
  it('earns and spends coin, refusing unaffordable purchases', () => {
    const r = new Roster(defaultParty());
    expect(r.gold).toBe(0);
    r.earn(30);
    expect(r.gold).toBe(30);
    expect(r.spend(40)).toBe(false); // can't afford
    expect(r.gold).toBe(30); // unchanged
    expect(r.spend(20)).toBe(true);
    expect(r.gold).toBe(10);
  });

  it('round-trips gold through serialize/deserialize', () => {
    const map: MapSource = { name: 'A', ascii: '#####\n#>..#\n#####' };
    const roster = new Roster(defaultParty());
    roster.earn(123);
    const rng = new Rng(1);
    const world = new World([parseMap(map)], new EventBus(), rng, roster);
    const json = serialize(world, roster, rng);

    const dstRoster = new Roster(defaultParty());
    const dstWorld = new World([parseMap(map)], new EventBus(), new Rng(0), dstRoster);
    deserialize(json, dstWorld, dstRoster, new Rng(0));
    expect(dstRoster.gold).toBe(123);
  });
});

describe('monster gold drops', () => {
  it('banks coin and emits party/gold when a monster dies', () => {
    const map: MapSource = { name: 'A', ascii: '#####\n#>..#\n#####', monsters: [{ x: 3, y: 1, species: COIN_SLIME }] };
    const bus = new EventBus();
    const gold = vi.fn();
    bus.on('party/gold', gold);
    const roster = new Roster(defaultParty());
    const world = new World([parseMap(map)], bus, new Rng(7), roster);
    world.stepForward(); // step adjacent to the slime at (3,1)
    // Loop past the occasional natural-1 auto-miss until the 1-HP slime dies.
    for (let i = 0; i < 20 && world.monsters.length > 0; i++) {
      world.attack(0);
      world.tick(1000); // clear the attack cooldown and prune the dead
    }
    expect(world.monsters).toHaveLength(0);
    expect(roster.gold).toBe(5);
    expect(gold).toHaveBeenCalledWith({ type: 'party/gold', amount: 5, total: 5 });
  });
});

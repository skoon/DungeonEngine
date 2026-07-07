import { describe, expect, it } from 'vitest';
import { Dir } from '@/core/grid';
import { cellAt, edgeKey } from '@/core/dungeon';
import { EventBus } from '@/core/events';
import { parseMap, type MapSource } from '@/core/mapParser';
import { Rng } from '@/core/rng';
import { Roster } from '@/core/roster';
import { World } from '@/core/world';
import { defaultParty } from '@/data/party';
import { item } from '@/data/items';
import { serialize, deserialize } from '@/save/save';

const MAPS: MapSource[] = [
  { name: 'A', ascii: '#####\n#>..#\n#####', edges: [{ x: 2, y: 1, dir: Dir.E, kind: 'door' }] },
  { name: 'B', ascii: '#####\n#>..#\n#####' },
];

function build() {
  const bus = new EventBus();
  const levels = MAPS.map((m) => parseMap(m));
  const roster = new Roster(defaultParty());
  const rng = new Rng(9);
  const world = new World(levels, bus, rng, roster);
  return { world, roster, rng, levels };
}

describe('save round-trip', () => {
  it('restores party, position, level, items, doors and RNG', () => {
    const src = build();

    // Mutate a bunch of state on level A.
    src.roster.member(0)!.hp.cur = 4;
    src.roster.member(0)!.xp = 42;
    const doorA = src.world.level.edges.get(edgeKey(2, 1, Dir.E))!;
    doorA.door!.open = true;
    doorA.blocksMovement = false;
    cellAt(src.world.level, 1, 1)!.items = [item('gem'), item('rations', { count: 3 })];
    // Descend to level B.
    src.world.changeLevel(1, { x: 3, y: 1 }, Dir.W);
    for (let i = 0; i < 5; i++) src.rng.next(); // advance RNG

    const json = serialize(src.world, src.roster, src.rng);

    // Load into a completely fresh game built from the same maps.
    const dst = build();
    expect(deserialize(json, dst.world, dst.roster, dst.rng)).toBe(true);

    expect(dst.world.levelIndex).toBe(1);
    expect(dst.world.party.getPose()).toEqual({ pos: { x: 3, y: 1 }, facing: Dir.W });
    expect(dst.roster.member(0)!.hp.cur).toBe(4);
    expect(dst.roster.member(0)!.xp).toBe(42);
    expect(dst.rng.getState()).toBe(src.rng.getState());

    // Level-A state survived even though we saved while on level B.
    dst.world.changeLevel(0, { x: 1, y: 1 });
    expect(dst.world.level.edges.get(edgeKey(2, 1, Dir.E))!.door!.open).toBe(true);
    const items = cellAt(dst.world.level, 1, 1)!.items!;
    expect(items.map((i) => i.tpl.id)).toEqual(['gem', 'rations']);
    expect(items[1]!.count).toBe(3);
  });

  it('rejects a blob from a different version', () => {
    const dst = build();
    expect(deserialize('{"version":999}', dst.world, dst.roster, dst.rng)).toBe(false);
    expect(deserialize('not json', dst.world, dst.roster, dst.rng)).toBe(false);
  });

  it('round-trips a full monster kill (dead stays dead)', () => {
    const glass = { id: 'glass', name: 'Glass', glyph: 'x', color: '#fff', maxHp: 1, ac: -100, attackBonus: 0, damage: [1, 1] as [number, number], moveMs: 9999, attackMs: 9999, sight: 1, xp: 1, ai: 'dumb' as const };
    const map: MapSource = { name: 'A', ascii: '#####\n#>..#\n#####', monsters: [{ x: 3, y: 1, species: glass }] };

    const srcRoster = new Roster(defaultParty());
    const srcRng = new Rng(3);
    const srcWorld = new World([parseMap(map)], new EventBus(), srcRng, srcRoster);
    srcWorld.stepForward(); // step adjacent to the monster at (3,1)
    for (let i = 0; i < 10 && srcWorld.monsters.length > 0; i++) { srcWorld.attack(0); srcWorld.tick(1000); }
    expect(srcWorld.monsters).toHaveLength(0);

    const json = serialize(srcWorld, srcRoster, srcRng);

    const dstRoster = new Roster(defaultParty());
    const dstRng = new Rng(0);
    const dstWorld = new World([parseMap(map)], new EventBus(), dstRng, dstRoster);
    expect(dstWorld.monsters).toHaveLength(1); // fresh world respawns it
    deserialize(json, dstWorld, dstRoster, dstRng);
    expect(dstWorld.monsters).toHaveLength(0); // ...but the save says it's dead
  });
});

import { describe, expect, it, vi } from 'vitest';
import { Dir } from '@/core/grid';
import { EventBus } from '@/core/events';
import { parseMap, type MapSource } from '@/core/mapParser';
import { Rng } from '@/core/rng';
import { Roster } from '@/core/roster';
import { World } from '@/core/world';
import { defaultParty } from '@/data/party';
import { item } from '@/data/items';

function setup(source: MapSource): { world: World; roster: Roster; log: string[]; bus: EventBus } {
  const level = parseMap(source);
  const bus = new EventBus();
  const log: string[] = [];
  bus.on('log/message', (e) => log.push(e.text));
  const roster = new Roster(defaultParty());
  return { world: new World(level, bus, new Rng(3), roster), roster, log, bus };
}

describe('looting an alcove', () => {
  it('takes items from the faced niche into the party packs', () => {
    const { world, roster } = setup({
      name: 'alcove',
      ascii: '###\n#>#\n###',
      edges: [{ x: 1, y: 1, dir: Dir.E, alcove: [item('gem')] }],
    });
    world.use(); // face East at the alcove
    const held = roster.members.flatMap((c) => c.backpack).filter(Boolean);
    expect(held.some((i) => i?.tpl.id === 'gem')).toBe(true);
  });
});

describe('keyhole doors', () => {
  const source: MapSource = {
    name: 'locked',
    ascii: '####\n#>.#\n####',
    edges: [{ x: 1, y: 1, dir: Dir.E, kind: 'door', keyId: 'iron' }],
  };

  it('opens when a party member holds the matching key (Pip carries one)', () => {
    const { world } = setup(source);
    expect(world.stepForward()).toBe(false); // locked
    world.use(); // Pip has the iron key
    expect(world.stepForward()).toBe(true); // now unlocked
  });

  it('stays locked without the key', () => {
    const level = parseMap(source);
    const bus = new EventBus();
    const locked = vi.fn();
    bus.on('door/locked', locked);
    const party = defaultParty();
    party[3]!.backpack = party[3]!.backpack.map(() => null); // drop Pip's key
    const world = new World(level, bus, new Rng(1), new Roster(party));
    world.use();
    expect(locked).toHaveBeenCalledWith({ type: 'door/locked', keyId: 'iron' });
    expect(world.stepForward()).toBe(false);
  });
});

describe('pit fall damage', () => {
  it('hurts every party member', () => {
    const { world, roster } = setup({
      name: 'pit',
      ascii: '#####\n#>..#\n#####',
      triggers: [{ x: 2, y: 1, kind: 'pit' }],
    });
    const before = roster.members.map((c) => c.hp.cur);
    world.stepForward(); // onto the pit
    const after = roster.members.map((c) => c.hp.cur);
    expect(after.every((hp, i) => hp < before[i]!)).toBe(true);
  });
});

import { describe, expect, it, vi } from 'vitest';
import { Dir } from '@/core/grid';
import { cellAt } from '@/core/dungeon';
import { EventBus } from '@/core/events';
import { parseMap, type MapSource } from '@/core/mapParser';
import { Rng } from '@/core/rng';
import { Roster } from '@/core/roster';
import { World } from '@/core/world';
import { defaultParty } from '@/data/party';
import { town, TOWN_ENTRANCE } from '@/data/maps/town';
import { createMember } from '@/data/creation';

const DUNGEON: MapSource = { name: 'Dungeon', ascii: '#####\n#>..#\n#####' };
const TOWN_INDEX = 1;

function build() {
  const bus = new EventBus();
  const levels = [parseMap(DUNGEON), parseMap(town)];
  const roster = new Roster(defaultParty());
  const world = new World(levels, bus, new Rng(1), roster);
  world.setTown(TOWN_INDEX, TOWN_ENTRANCE.pos, TOWN_ENTRANCE.facing);
  const events: string[] = [];
  bus.on('town/service', (e) => events.push(`service:${e.service}`));
  const log: string[] = [];
  bus.on('log/message', (e) => log.push(e.text));
  return { world, roster, bus, events, log };
}

describe('Town Hub services (M-DR4)', () => {
  it('emits town/service when stepping onto a service cell', () => {
    const { world, events } = build();
    // Stand just east of the western shrine (1,3), facing it, then step on.
    world.changeLevel(TOWN_INDEX, { x: 2, y: 3 }, Dir.W);
    world.stepForward();
    expect(events).toContain('service:raise');
  });

  it('rest fully restores the living but leaves the dead', () => {
    const { world, roster, events } = build();
    roster.member(0)!.hp.cur = 1;
    roster.member(0)!.mp.cur = 0;
    roster.member(1)!.conditions.add('dead');
    roster.member(1)!.hp.cur = -10;
    world.changeLevel(TOWN_INDEX, { x: 4, y: 4 }, Dir.S);
    world.stepForward(); // onto the hearth at (4,5)
    expect(events).toContain('service:rest');
    expect(roster.member(0)!.hp.cur).toBe(roster.member(0)!.hp.max);
    expect(roster.member(0)!.mp.cur).toBe(roster.member(0)!.mp.max);
    expect(roster.member(1)!.conditions.has('dead')).toBe(true);
    expect(roster.member(1)!.hp.cur).toBe(-10);
  });

  it('raiseDead clears death, restores half HP, and spends gold', () => {
    const { world, roster, bus } = build();
    const raised = vi.fn();
    bus.on('char/raised', raised);
    roster.earn(1000);
    roster.member(2)!.conditions.add('dead');
    roster.member(2)!.hp.cur = -10;
    expect(world.raiseDead(2)).toBe(true);
    expect(roster.member(2)!.conditions.has('dead')).toBe(false);
    expect(roster.member(2)!.hp.cur).toBe(Math.floor(roster.member(2)!.hp.max / 2));
    expect(roster.gold).toBe(1000 - 100 * roster.member(2)!.level);
    expect(raised).toHaveBeenCalledOnce();
  });

  it('raiseDead refuses when the purse is too light', () => {
    const { world, roster } = build();
    roster.member(0)!.conditions.add('dead');
    expect(world.raiseDead(0)).toBe(false);
    expect(roster.member(0)!.conditions.has('dead')).toBe(true);
  });

  it('replaceMember swaps in a recruit, drops old gear, spends recruit gold', () => {
    const { world, roster } = build();
    roster.earn(1000);
    world.changeLevel(TOWN_INDEX, TOWN_ENTRANCE.pos, TOWN_ENTRANCE.facing);
    const dead = roster.member(0)!;
    dead.conditions.add('dead');
    const goldItems = [...dead.hands, ...Object.values(dead.equipment), ...dead.backpack].filter(Boolean).length;
    const recruit = createMember({ name: 'Newbie', clazz: 'fighter', stats: dead.stats }, 0);
    expect(world.replaceMember(0, recruit)).toBe(true);
    expect(roster.member(0)!.name).toBe('Newbie');
    expect(roster.gold).toBe(950);
    const floor = cellAt(world.level, TOWN_ENTRANCE.pos.x, TOWN_ENTRANCE.pos.y)!.items ?? [];
    expect(floor.length).toBe(goldItems); // the fallen's gear was tipped out
  });

  it('portal to town, raise a fallen member, then return through the portal', () => {
    const { world, roster } = build();
    roster.earn(1000);
    roster.member(2)!.mp.cur = 20; // cleric is member 1; here we just need a caster
    roster.member(1)!.mp.cur = 20;
    world.stepForward(); // recall anchor at (2,1) facing E
    const anchor = world.party.getPose();
    world.cast(1, 'town_portal');
    expect(world.levelIndex).toBe(TOWN_INDEX);

    roster.member(2)!.conditions.add('dead');
    roster.member(2)!.hp.cur = -10;
    expect(world.raiseDead(2)).toBe(true);

    // Walk to the return portal at (4,1) and step through.
    world.changeLevel(TOWN_INDEX, { x: 4, y: 2 }, Dir.N);
    world.stepForward();
    expect(world.levelIndex).toBe(0);
    expect(world.party.getPose()).toEqual(anchor);
  });
});

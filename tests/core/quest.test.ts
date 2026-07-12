import { describe, expect, it } from 'vitest';
import { EventBus } from '@/core/events';
import { parseMap } from '@/core/mapParser';
import { Rng } from '@/core/rng';
import { Roster } from '@/core/roster';
import { World } from '@/core/world';
import { defaultParty } from '@/data/party';
import { item } from '@/data/items';

// A seal cell directly ahead of the party start, requiring the amulet.
function setup() {
  const bus = new EventBus();
  const level = parseMap({
    name: 'gates',
    ascii: '#####\n#>..#\n#####',
    triggers: [
      {
        x: 2, y: 1, kind: 'victory', visible: true, requires: 'amulet_dawn',
        text: 'Dawn-runes seal the great gates.',
      },
    ],
  });
  const roster = new Roster(defaultParty());
  const world = new World(level, bus, new Rng(1), roster);
  return { world, roster, bus };
}

describe('quest victory (M14)', () => {
  it('does not win without the amulet — just shows the hint', () => {
    const { world, bus } = setup();
    let won = false;
    const log: string[] = [];
    bus.on('game/won', () => (won = true));
    bus.on('log/message', (e) => log.push(e.text));
    world.stepForward(); // onto the seal, empty-handed
    expect(won).toBe(false);
    expect(log.some((l) => /dawn-runes/i.test(l))).toBe(true);
  });

  it('wins when a living member carries the amulet onto the seal', () => {
    const { world, roster, bus } = setup();
    let won = false;
    bus.on('game/won', () => (won = true));
    roster.member(0)!.backpack[0] = item('amulet_dawn');
    world.stepForward();
    expect(won).toBe(true);
  });

  it('an amulet in a dead member’s pack does not count', () => {
    const { world, roster, bus } = setup();
    let won = false;
    bus.on('game/won', () => (won = true));
    const c = roster.member(3)!;
    c.backpack[0] = item('amulet_dawn');
    c.conditions.add('dead'); // the fallen can't deliver it
    world.stepForward();
    expect(won).toBe(false);
  });

  it('the Lich drops the amulet', async () => {
    const { MONSTERS } = await import('@/data/monsters');
    const drops = MONSTERS.lich!.loot!();
    expect(drops.some((d) => d.tpl.id === 'amulet_dawn')).toBe(true);
  });
});

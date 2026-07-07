import { describe, expect, it } from 'vitest';
import { EventBus } from '@/core/events';
import { parseMap } from '@/core/mapParser';
import { Rng } from '@/core/rng';
import { Roster } from '@/core/roster';
import { World } from '@/core/world';
import { defaultParty } from '@/data/party';
import { item } from '@/data/items';

function setup(ascii: string, floor?: { x: number; y: number; items: ReturnType<typeof item>[] }[]) {
  const level = parseMap({ name: 't', ascii, ...(floor ? { floor } : {}) });
  const bus = new EventBus();
  const roster = new Roster(defaultParty());
  const world = new World(level, bus, new Rng(1), roster);
  return { world, roster, level };
}

describe('attack with a forced hand (click-to-attack, M8)', () => {
  it('applies cooldown to exactly the chosen hand', () => {
    const { world, roster } = setup('#####\n#>..#\n#####');
    const kestra = roster.member(0)!;
    world.attack(0, 1); // swing with the right hand specifically
    expect(kestra.cooldowns[1]).toBeGreaterThan(0);
    expect(kestra.cooldowns[0]).toBe(0);
  });

  it('still auto-picks the weapon hand when none is forced', () => {
    const { world, roster } = setup('#####\n#>..#\n#####');
    const kestra = roster.member(0)!; // short sword in hand 0
    world.attack(0);
    expect(kestra.cooldowns[0]).toBeGreaterThan(0);
  });
});

describe('takeFloorItems (click-to-pick-up, M8)', () => {
  it('scoops loose items on the current cell into the party', () => {
    const { world, roster, level } = setup('###\n#>#\n###', [{ x: 1, y: 1, items: [item('gem')] }]);
    world.takeFloorItems();
    expect(level.cells[1 * 3 + 1]?.items).toHaveLength(0);
    const held = roster.members.flatMap((c) => c.backpack).filter(Boolean);
    expect(held.some((i) => i?.tpl.id === 'gem')).toBe(true);
  });

  it('is a no-op when the floor is empty', () => {
    const { world } = setup('###\n#>#\n###');
    expect(() => world.takeFloorItems()).not.toThrow();
  });
});

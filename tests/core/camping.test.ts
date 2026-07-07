import { describe, expect, it } from 'vitest';
import { EventBus } from '@/core/events';
import { parseMap } from '@/core/mapParser';
import { Rng } from '@/core/rng';
import { Roster } from '@/core/roster';
import { World } from '@/core/world';
import type { MonsterSpecies } from '@/core/monster';
import { defaultParty } from '@/data/party';

function setup(seed: number, monsters?: { x: number; y: number; species: MonsterSpecies }[]) {
  const bus = new EventBus();
  const level = parseMap({ name: 'camp', ascii: '#########\n#>......#\n#########', ...(monsters ? { monsters } : {}) });
  const roster = new Roster(defaultParty());
  const world = new World(level, bus, new Rng(seed), roster);
  return { world, roster, bus };
}

function skeleton(hunting: boolean): MonsterSpecies {
  return {
    id: 's', name: 'Skeleton', glyph: 'S', color: '#fff', maxHp: 10, ac: 12, attackBonus: 2,
    damage: [1, 6], moveMs: hunting ? 1 : 9999, attackMs: 9999, sight: 9, xp: 5, ai: 'dumb',
  };
}

describe('camping', () => {
  it('rests to heal, consuming rations', () => {
    // Seed chosen so the wandering-monster roll does not fire.
    let seed = 1;
    for (; seed < 50; seed++) {
      const { world, roster } = setup(seed);
      roster.member(0)!.hp.cur = 1;
      const rationsBefore = roster.members.flatMap((c) => c.backpack).filter((it) => it?.tpl.food).length;
      world.camp();
      if (roster.member(0)!.hp.cur > 1) {
        // Rested successfully this seed — verify food was consumed and MP restored.
        const rationsAfter = roster.members.flatMap((c) => c.backpack).filter((it) => it?.tpl.food).length;
        expect(rationsAfter).toBeLessThan(rationsBefore);
        expect(roster.member(1)!.mp.cur).toBe(roster.member(1)!.mp.max);
        return;
      }
    }
    throw new Error('no seed produced a successful rest');
  });

  it('refuses to camp while a monster is hunting', () => {
    const { world, roster, bus } = setup(1, [{ x: 3, y: 1, species: skeleton(true) }]);
    world.tick(200); // let the skeleton notice the party and start hunting
    roster.member(0)!.hp.cur = 1;
    const log: string[] = [];
    bus.on('log/message', (e) => log.push(e.text));
    world.camp();
    expect(roster.member(0)!.hp.cur).toBe(1); // no healing
    expect(log.some((l) => /too dangerous/i.test(l))).toBe(true);
  });
});

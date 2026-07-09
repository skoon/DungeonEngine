import { describe, expect, it, vi } from 'vitest';
import { EventBus } from '@/core/events';
import { parseMap } from '@/core/mapParser';
import { Rng } from '@/core/rng';
import { Roster } from '@/core/roster';
import { World } from '@/core/world';
import type { MonsterSpecies } from '@/core/monster';
import { defaultParty } from '@/data/party';

function bigXpTarget(): MonsterSpecies {
  return {
    id: 'trophy', name: 'Trophy', glyph: 't', color: '#fff', maxHp: 1, ac: -100, attackBonus: 0,
    damage: [1, 1], moveMs: 9999, attackMs: 9999, sight: 1, xp: 150, ai: 'dumb',
  };
}

describe('killing monsters grants XP and levels the party (M10)', () => {
  it('awards XP to living members and fires a level-up', () => {
    const level = parseMap({ name: 'arena', ascii: '#####\n#>..#\n#####', monsters: [{ x: 2, y: 1, species: bigXpTarget() }] });
    const bus = new EventBus();
    const roster = new Roster(defaultParty());
    const world = new World(level, bus, new Rng(1), roster);
    const leveled = vi.fn();
    bus.on('char/leveledUp', leveled);

    const startLevel = roster.member(0)!.level;
    const startHp = roster.member(0)!.hp.max;
    for (let i = 0; i < 12 && world.monsters.length > 0; i++) { world.attack(0); world.tick(1000); }
    expect(world.monsters).toHaveLength(0);

    // 150 XP crosses the level-2 threshold (100).
    expect(roster.member(0)!.xp).toBe(150);
    expect(roster.member(0)!.level).toBe(startLevel + 1);
    expect(roster.member(0)!.hp.max).toBeGreaterThan(startHp);
    expect(leveled).toHaveBeenCalled();
  });

  it('the fallen do not gain XP', () => {
    const level = parseMap({ name: 'arena', ascii: '#####\n#>..#\n#####', monsters: [{ x: 2, y: 1, species: bigXpTarget() }] });
    const bus = new EventBus();
    const roster = new Roster(defaultParty());
    roster.member(1)!.hp.cur = 0;
    roster.member(1)!.conditions.add('unconscious');
    const world = new World(level, bus, new Rng(1), roster);
    for (let i = 0; i < 12 && world.monsters.length > 0; i++) { world.attack(0); world.tick(1000); }
    expect(roster.member(1)!.xp).toBe(0);
  });
});

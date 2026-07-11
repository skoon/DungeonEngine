import { describe, expect, it } from 'vitest';
import { EventBus } from '@/core/events';
import { parseMap } from '@/core/mapParser';
import { Rng } from '@/core/rng';
import { Roster } from '@/core/roster';
import { World } from '@/core/world';
import type { MonsterSpecies } from '@/core/monster';
import { defaultParty } from '@/data/party';

function world(ascii: string, monsters: { x: number; y: number; species: MonsterSpecies }[], seed = 1) {
  const bus = new EventBus();
  const roster = new Roster(defaultParty());
  const w = new World(parseMap({ name: 't', ascii, monsters }), bus, new Rng(seed), roster);
  return { w, roster, bus };
}

// ---- Poison (Roster) -------------------------------------------------------

describe('poison condition (M13)', () => {
  it('ticks HP down over time, then wears off', () => {
    const bus = new EventBus();
    const roster = new Roster(defaultParty());
    const c = roster.member(0)!;
    c.hp.cur = c.hp.max;
    roster.applyPoison(0);
    expect(c.conditions.has('poisoned')).toBe(true);

    const start = c.hp.cur;
    // Six doses at one point per 2s: drive well past the full duration.
    for (let i = 0; i < 20; i++) roster.tickPoison(2000, bus);
    expect(c.hp.cur).toBe(start - 6); // POISON_DOSE points, no more
    expect(c.conditions.has('poisoned')).toBe(false); // venom spent
  });

  it('is cleared by curing the condition (camp / Cure Wounds path)', () => {
    const bus = new EventBus();
    const roster = new Roster(defaultParty());
    roster.applyPoison(0);
    roster.member(0)!.conditions.delete('poisoned'); // what camp/cure do
    const hp = roster.member(0)!.hp.cur;
    for (let i = 0; i < 5; i++) roster.tickPoison(2000, bus);
    expect(roster.member(0)!.hp.cur).toBe(hp); // no further damage once cured
  });

  it('a Cave Spider hit can envenom the party', () => {
    const spider: MonsterSpecies = { ...( // guaranteed-hit, guaranteed-poison spider
      { id: 'cs', name: 'Cave Spider', glyph: 'x', color: '#000', maxHp: 7, ac: 14,
        attackBonus: 99, damage: [1, 1], moveMs: 200, attackMs: 200, sight: 9, xp: 1,
        ai: 'dumb', poison: 1 } as MonsterSpecies) };
    const { w, roster } = world('#####\n#>..#\n#####', [{ x: 3, y: 1, species: spider }]);
    for (let i = 0; i < 60 && !roster.members.some((c) => c.conditions.has('poisoned')); i++) w.tick(100);
    expect(roster.members.some((c) => c.conditions.has('poisoned'))).toBe(true);
  });
});

// ---- Ranged monsters -------------------------------------------------------

describe('monster ranged attacks (M13)', () => {
  it('fires a bolt down a clear line and damages the party', () => {
    const archer: MonsterSpecies = {
      id: 'arc', name: 'Archer', glyph: 'A', color: '#fff', maxHp: 10, ac: 12,
      attackBonus: 99, damage: [3, 3], moveMs: 99999, attackMs: 400, sight: 12, ai: 'dumb', xp: 1,
      ranged: { damage: [3, 3], range: 8, label: 'arrow' },
    };
    // Long corridor: the archer never becomes adjacent, so any party damage
    // must come from the ranged shot.
    const { w, roster } = world('##########\n#>.......#\n##########', [
      { x: 8, y: 1, species: archer }, // 7 cells away — within the bolt's range 8
    ]);
    const before = roster.members.reduce((s, c) => s + c.hp.cur, 0);
    for (let i = 0; i < 60; i++) w.tick(100);
    const after = roster.members.reduce((s, c) => s + c.hp.cur, 0);
    expect(after).toBeLessThan(before); // sniped from range
  });

  it('does not fire through a wall (no line of sight)', () => {
    const archer: MonsterSpecies = {
      id: 'arc', name: 'Archer', glyph: 'A', color: '#fff', maxHp: 10, ac: 12,
      attackBonus: 99, damage: [5, 5], moveMs: 99999, attackMs: 400, sight: 12, ai: 'dumb', xp: 1,
      ranged: { damage: [5, 5], range: 8, label: 'arrow' },
    };
    // A wall column separates the party from the archer's row; the archer can't
    // move (moveMs huge) and has no clear cardinal shot.
    const { w, roster } = world('#######\n#>#...#\n#######', [{ x: 5, y: 1, species: archer }]);
    const before = roster.members.reduce((s, c) => s + c.hp.cur, 0);
    for (let i = 0; i < 40; i++) w.tick(100);
    expect(roster.members.reduce((s, c) => s + c.hp.cur, 0)).toBe(before);
  });
});

// ---- Boss phases -----------------------------------------------------------

describe('boss phases (M13)', () => {
  it('summons reinforcements and enrages at the HP threshold', () => {
    const boss: MonsterSpecies = {
      id: 'boss', name: 'Bone Lord', glyph: 'B', color: '#fff', maxHp: 20, ac: 10,
      attackBonus: 0, damage: [1, 1], moveMs: 99999, attackMs: 99999, sight: 12, ai: 'dumb', xp: 1,
      phases: [{ atHpFrac: 0.5, summon: { species: {
        id: 'add', name: 'Skeleton', glyph: 'S', color: '#fff', maxHp: 5, ac: 10, attackBonus: 0,
        damage: [1, 1], moveMs: 99999, attackMs: 99999, sight: 8, ai: 'dumb', xp: 1,
      }, count: 2 }, speedMult: 0.5 }],
    };
    const { w } = world('#######\n#>....#\n#######', [{ x: 5, y: 1, species: boss }]);
    const b = w.monsters.find((m) => m.species.id === 'boss')!;
    expect(w.monsters.length).toBe(1);

    // Chip the boss to just above half — no phase yet.
    (w as unknown as { hitMonster(m: typeof b, d: number): void }).hitMonster(b, 9); // 20 -> 11
    expect(w.monsters.length).toBe(1);
    expect(b.phasesFired).toBe(0);

    // Cross the half-HP line — it raises two skeletons and enrages once.
    (w as unknown as { hitMonster(m: typeof b, d: number): void }).hitMonster(b, 2); // 11 -> 9 (<=10)
    expect(b.phasesFired).toBe(1);
    expect(b.speedMult).toBe(0.5);
    expect(w.monsters.length).toBe(3); // boss + 2 summons

    // Further damage doesn't re-trigger the one-shot phase.
    (w as unknown as { hitMonster(m: typeof b, d: number): void }).hitMonster(b, 1);
    expect(b.phasesFired).toBe(1);
    expect(w.monsters.length).toBe(3);
  });
});

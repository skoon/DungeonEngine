import { describe, expect, it } from 'vitest';
import { MONSTERS } from '@/data/monsters';

describe('monster registry', () => {
  const entries = Object.entries(MONSTERS);

  it('keys each species by its own id and every species is reachable', () => {
    for (const [key, sp] of entries) {
      expect(sp.id).toBe(key);
    }
    expect(entries.length).toBeGreaterThanOrEqual(12);
  });

  it('has unique ids', () => {
    const ids = entries.map(([, sp]) => sp.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('has unique glyphs (so the map renders them distinctly)', () => {
    const glyphs = entries.map(([, sp]) => sp.glyph);
    expect(new Set(glyphs).size).toBe(glyphs.length);
  });

  it('awards positive xp for every species', () => {
    for (const [, sp] of entries) {
      expect(sp.xp).toBeGreaterThan(0);
    }
  });

  it('references only registered species in boss summons', () => {
    const known = new Set(Object.keys(MONSTERS));
    for (const [, sp] of entries) {
      for (const phase of sp.phases ?? []) {
        if (phase.summon) expect(known.has(phase.summon.species.id)).toBe(true);
      }
    }
  });

  it('declares the lich as a two-phase boss in descending HP order', () => {
    const lich = MONSTERS.lich;
    expect(lich).toBeDefined();
    const phases = lich!.phases ?? [];
    expect(phases.length).toBe(2);
    for (let i = 1; i < phases.length; i++) {
      expect(phases[i]!.atHpFrac).toBeLessThan(phases[i - 1]!.atHpFrac);
    }
    // It uses every M13 system: ranged, phases, and summons.
    expect(lich!.ranged).toBeDefined();
    expect(phases.every((p) => p.summon)).toBe(true);
  });
});

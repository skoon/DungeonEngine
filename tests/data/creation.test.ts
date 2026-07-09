import { describe, expect, it } from 'vitest';
import { Rng } from '@/core/rng';
import { isWeapon } from '@/core/item';
import {
  CLASS_ORDER, buildParty, createMember, defaultCreationParty, previewHpMp, rollStats,
} from '@/data/creation';

describe('rollStats', () => {
  it('produces 4d6-drop-lowest values in [3,18]', () => {
    const rng = new Rng(42);
    for (let i = 0; i < 200; i++) {
      const s = rollStats(rng);
      for (const v of Object.values(s)) {
        expect(v).toBeGreaterThanOrEqual(3);
        expect(v).toBeLessThanOrEqual(18);
      }
    }
  });

  it('is deterministic for a seed', () => {
    expect(rollStats(new Rng(7))).toEqual(rollStats(new Rng(7)));
  });
});

describe('previewHpMp', () => {
  it('gives casters MP and martials none', () => {
    const stats = { str: 12, dex: 12, con: 14, int: 16, wis: 15 };
    expect(previewHpMp('mage', stats).mpMax).toBeGreaterThan(0);
    expect(previewHpMp('fighter', stats).mpMax).toBe(0);
    // A d10 fighter has more HP than a d4 mage at equal CON.
    expect(previewHpMp('fighter', stats).hpMax).toBeGreaterThan(previewHpMp('mage', stats).hpMax);
  });
});

describe('createMember', () => {
  it('builds a fighter with a weapon, HP, and no spells', () => {
    const c = createMember({ name: 'Test', clazz: 'fighter', stats: { str: 16, dex: 12, con: 14, int: 9, wis: 10 } }, 0);
    expect(c.name).toBe('Test');
    expect(c.hands.some((h) => h && isWeapon(h))).toBe(true);
    expect(c.spells).toHaveLength(0);
    expect(c.hp.max).toBeGreaterThan(0);
    expect(c.hp.cur).toBe(c.hp.max);
  });

  it('builds a mage with spells and mana', () => {
    const c = createMember({ name: 'Wiz', clazz: 'mage', stats: { str: 8, dex: 13, con: 10, int: 16, wis: 11 } }, 2);
    expect(c.spells.map((s) => s.id)).toContain('magic_missile');
    expect(c.mp.max).toBeGreaterThan(0);
  });

  it('falls back to the class name when name is blank', () => {
    const c = createMember({ name: '', clazz: 'thief', stats: { str: 11, dex: 16, con: 11, int: 12, wis: 10 } }, 3);
    expect(c.name).toBe('Thief');
  });
});

describe('defaultCreationParty + buildParty', () => {
  it('rolls the four classes with distinct names', () => {
    const members = defaultCreationParty(new Rng(3));
    expect(members.map((m) => m.clazz)).toEqual(CLASS_ORDER);
    expect(new Set(members.map((m) => m.name)).size).toBe(4);
  });

  it('builds four playable characters', () => {
    const party = buildParty(defaultCreationParty(new Rng(5)));
    expect(party).toHaveLength(4);
    party.forEach((c, i) => {
      expect(c.hp.max).toBeGreaterThan(0);
      expect(c.portrait).toBe(i);
    });
  });
});

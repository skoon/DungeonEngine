import { describe, expect, it } from 'vitest';
import { type Matchup, formatReport, runMatchup } from '@/sim/autobattle';

const one = (species: string, partyLevel: number, count = 1): Matchup => ({
  label: `${count > 1 ? count + 'x ' : ''}${species}`,
  enemies: [{ species, count }],
  partyLevel,
});

// The actual Sunless Crypt encounter, minus / with the boss. Fought in the
// open (enemies surround the party) — the shape that makes the crypt lethal.
const cryptPack = (partyLevel: number, withBoss: boolean, startHpPct = 1): Matchup => ({
  label: `crypt ${withBoss ? 'full' : 'no boss'}${startHpPct < 1 ? ` @${Math.round(startHpPct * 100)}%hp` : ''}`,
  partyLevel,
  arena: 'open',
  startHpPct,
  enemies: [
    { species: 'giant_rat', count: 2 },
    { species: 'cave_spider', count: 1 },
    { species: 'skeleton', count: 1 },
    { species: 'zombie', count: 1 },
    ...(withBoss ? [{ species: 'bone_lord', count: 1 }] : []),
  ],
});

// The final boss fight (plan M14): the lich, arriving slightly hurt, flanked by
// two ghouls, fought in the open where its summons and soul bolts pile on.
const finalFight = (partyLevel: number): Matchup => ({
  label: 'final fight',
  partyLevel,
  arena: 'open',
  startHpPct: 0.85,
  enemies: [
    { species: 'lich', count: 1 },
    { species: 'ghoul', count: 2 },
  ],
});

describe('balance report (M12)', () => {
  it('measures the key matchups', () => {
    const solo: Matchup[] = [
      one('giant_rat', 1),
      one('kobold', 1),
      one('skeleton', 1),
      one('cave_spider', 1),
      one('zombie', 1),
      one('bone_lord', 1),
      one('bone_lord', 3),
      one('bone_lord', 4),
      // M14 dungeon-3-to-5 species, read at their target party level.
      one('ghoul', 3),
      one('necromancer', 3),
      one('necromancer', 4),
      one('stone_golem', 4),
      one('crypt_bat', 3),
    ];
    // Surround matchups: bosses/packs fought in the open room.
    const surround: Matchup[] = [
      { ...one('bone_lord', 1), label: 'bone_lord (open)', arena: 'open' },
      { ...one('bone_lord', 4), label: 'bone_lord (open)', arena: 'open' },
      cryptPack(1, false),
      cryptPack(1, false, 0.6), // arriving hurt from the pit fall — the real cliff
      cryptPack(3, false),
      cryptPack(1, true), // the doom scenario: fresh L1 party, full pack + boss
      cryptPack(2, true), // does grinding to L2 make it survivable?
      cryptPack(3, true), // the target grind level
      cryptPack(4, true),
      // M14 packs and the final boss fight.
      { label: '3x ghoul', enemies: [{ species: 'ghoul', count: 3 }], partyLevel: 3, arena: 'open' },
      { label: '4x crypt_bat', enemies: [{ species: 'crypt_bat', count: 4 }], partyLevel: 3, arena: 'open' },
      { label: 'lich alone', enemies: [{ species: 'lich', count: 1 }], partyLevel: 5, arena: 'open' },
      finalFight(5), // ~risky-but-doable at the intended arrival level
      finalFight(6), // one grind level later it should be safe
    ];
    const rows = [...solo, ...surround].map((m) => runMatchup(m, 30));
    // eslint-disable-next-line no-console
    console.log('\n' + formatReport(rows) + '\n');
    expect(rows).toHaveLength(solo.length + surround.length);

    // Regression guards (deterministic seeds, so these are stable). They encode
    // the M12 balance intent, not just current numbers.
    const at = (label: string, lvl: number): number => {
      const r = rows.find((row) => row.label === label && row.partyLevel === lvl);
      if (!r) throw new Error(`no row ${label} @L${lvl}`);
      return r.winRate;
    };

    // 1-on-1, a healthy L1 party must handle every basic monster.
    for (const s of ['giant_rat', 'kobold', 'skeleton', 'cave_spider', 'zombie']) {
      expect(at(s, 1)).toBeGreaterThanOrEqual(0.95);
    }

    // Post-M13 progression contract. Grinding to L4 makes the full crypt (now
    // a summoning, enraging boss fight) safe...
    expect(at('crypt full', 4)).toBeGreaterThanOrEqual(0.85);
    // ...L3 is the "risky but doable" target — neither trivial nor hopeless...
    expect(at('crypt full', 3)).toBeGreaterThanOrEqual(0.55);
    expect(at('crypt full', 3)).toBeLessThanOrEqual(0.85);
    // ...and the full crypt at L1 stays a death trap, so the "level up first"
    // gate holds (the Pillared Hall grind loop exists to close this gap).
    expect(at('crypt full', 1)).toBeLessThanOrEqual(0.35);

    // M14 contract. The new dungeon-3-to-5 species are cleanly winnable at their
    // target level (measured 100% at these seeds; guard the ≥90% design floor).
    expect(at('ghoul', 3)).toBeGreaterThanOrEqual(0.9);
    expect(at('3x ghoul', 3)).toBeGreaterThanOrEqual(0.9);
    expect(at('necromancer', 3)).toBeGreaterThanOrEqual(0.9);
    expect(at('necromancer', 4)).toBeGreaterThanOrEqual(0.9);
    expect(at('stone_golem', 4)).toBeGreaterThanOrEqual(0.9);
    expect(at('4x crypt_bat', 3)).toBeGreaterThanOrEqual(0.9);
    // The lich on its own is a strong-but-fair capstone the party can outlast.
    expect(at('lich alone', 5)).toBeGreaterThanOrEqual(0.9);

    // The final boss fight is the point: a real coin-flip-ish gate at the intended
    // arrival level (measured 70%), decisively won one grind level later (93%).
    expect(at('final fight', 5)).toBeGreaterThanOrEqual(0.55);
    expect(at('final fight', 5)).toBeLessThanOrEqual(0.8);
    expect(at('final fight', 6)).toBeGreaterThanOrEqual(0.85);
  }, 60_000);
});

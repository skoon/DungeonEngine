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
  }, 60_000);
});

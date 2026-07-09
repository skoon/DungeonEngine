import { describe, expect, it } from 'vitest';
import { Roster } from '@/core/roster';
import { defaultParty } from '@/data/party';
import { buildTownRows, hitTownRow } from '@/render/townOverlay';

describe('town overlay rows (M-DR5)', () => {
  it('raise mode lists one row per party member', () => {
    const roster = new Roster(defaultParty());
    const rows = buildTownRows('raise', roster);
    expect(rows).toHaveLength(4);
    expect(rows.every((r) => r.kind === 'raise')).toBe(true);
    expect(rows.map((r) => (r.kind === 'raise' ? r.member : -1))).toEqual([0, 1, 2, 3]);
  });

  it('recruit mode leads with reroll + class, then one hire row per slot', () => {
    const roster = new Roster(defaultParty());
    const rows = buildTownRows('recruit', roster);
    expect(rows).toHaveLength(6);
    expect(rows[0]!.kind).toBe('reroll');
    expect(rows[1]!.kind).toBe('class');
    expect(rows.slice(2).every((r) => r.kind === 'hire')).toBe(true);
  });

  it('hit-tests a click to the row under it, and misses outside the column', () => {
    const rows = buildTownRows('raise', new Roster(defaultParty()));
    // First row sits at TOP (84); rows are 16px tall from LEFT (24).
    expect(hitTownRow(rows.length, 40, 84)).toBe(0);
    expect(hitTownRow(rows.length, 40, 84 + 16)).toBe(1);
    expect(hitTownRow(rows.length, 40, 20)).toBe(-1); // above the list
    expect(hitTownRow(rows.length, 5, 84)).toBe(-1); // left of the column
  });
});

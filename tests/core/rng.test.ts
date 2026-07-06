import { describe, expect, it } from 'vitest';
import { Rng } from '@/core/rng';

describe('Rng', () => {
  it('is deterministic for a given seed', () => {
    const a = new Rng(1234);
    const b = new Rng(1234);
    for (let i = 0; i < 100; i++) expect(a.next()).toBe(b.next());
  });

  it('produces different sequences for different seeds', () => {
    const a = new Rng(1);
    const b = new Rng(2);
    const same = Array.from({ length: 20 }, () => a.next() === b.next());
    expect(same).toContain(false);
  });

  it('next() stays in [0, 1)', () => {
    const rng = new Rng(42);
    for (let i = 0; i < 10_000; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('int() covers the full inclusive range', () => {
    const rng = new Rng(7);
    const seen = new Set<number>();
    for (let i = 0; i < 1000; i++) seen.add(rng.int(1, 6));
    expect([...seen].sort()).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('dice() sums within bounds', () => {
    const rng = new Rng(99);
    for (let i = 0; i < 1000; i++) {
      const v = rng.dice(2, 6);
      expect(v).toBeGreaterThanOrEqual(2);
      expect(v).toBeLessThanOrEqual(12);
    }
  });

  it('round-trips through getState/setState (save/load)', () => {
    const a = new Rng(555);
    for (let i = 0; i < 17; i++) a.next();
    const b = new Rng(0);
    b.setState(a.getState());
    for (let i = 0; i < 50; i++) expect(b.next()).toBe(a.next());
  });

  it('pick() throws on an empty array', () => {
    expect(() => new Rng(1).pick([])).toThrow();
  });
});

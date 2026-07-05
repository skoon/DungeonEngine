/**
 * Seedable PRNG (mulberry32). Everything gameplay-visible must roll through
 * this so runs are reproducible and the RNG state can live in a save file.
 */
export class Rng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  /** Uniform float in [0, 1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Uniform integer in [min, max], both inclusive. */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  /** Sum of `count` rolls of a `sides`-sided die, e.g. dice(2, 6) = 2d6. */
  dice(count: number, sides: number): number {
    let sum = 0;
    for (let i = 0; i < count; i++) sum += this.int(1, sides);
    return sum;
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error('Rng.pick on empty array');
    return items[this.int(0, items.length - 1)] as T;
  }

  /** Serializable state for save files. */
  getState(): number {
    return this.state;
  }

  setState(state: number): void {
    this.state = state >>> 0;
  }
}

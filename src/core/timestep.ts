/**
 * Fixed-timestep accumulator. The simulation always advances in whole
 * SIM_TICK_MS steps regardless of display refresh rate; the render loop
 * (src/loop.ts) feeds it elapsed wall-clock time and runs however many
 * ticks fall out.
 */

export const SIM_TICK_MS = 100;

/**
 * If the tab is backgrounded (rAF suspended) we can come back to a huge
 * elapsed time. Clamp it: the world pauses rather than fast-forwarding
 * through seconds of combat, and we avoid a catch-up death spiral.
 */
export const MAX_FRAME_MS = 500;

export interface Timestep {
  /** Wall-clock ms not yet consumed by a full tick. Always < SIM_TICK_MS. */
  readonly accumulator: number;
  /** Total simulation ticks elapsed since start. */
  readonly tick: number;
}

export function createTimestep(): Timestep {
  return { accumulator: 0, tick: 0 };
}

export interface Advance {
  /** Number of simulation ticks the caller must now run. */
  steps: number;
  timestep: Timestep;
}

export function advance(ts: Timestep, elapsedMs: number): Advance {
  const clamped = Math.min(Math.max(elapsedMs, 0), MAX_FRAME_MS);
  let accumulator = ts.accumulator + clamped;
  let steps = 0;
  while (accumulator >= SIM_TICK_MS) {
    accumulator -= SIM_TICK_MS;
    steps++;
  }
  return { steps, timestep: { accumulator, tick: ts.tick + steps } };
}

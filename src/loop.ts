/**
 * requestAnimationFrame harness around the pure fixed-timestep accumulator
 * (core/timestep). Runs zero or more 100ms sim updates per frame, then one
 * render. Lives outside src/core because it touches browser APIs.
 */

import { advance, createTimestep, type Timestep } from './core/timestep';

export interface LoopHooks {
  /** Called once per elapsed simulation tick, with the tick number. */
  update: (tick: number) => void;
  /** Called once per animation frame, after any updates. */
  render: () => void;
}

export function startLoop(hooks: LoopHooks): () => void {
  let ts: Timestep = createTimestep();
  let last = performance.now();
  let rafId = 0;

  const frame = (now: number) => {
    const result = advance(ts, now - last);
    last = now;
    for (let i = 0; i < result.steps; i++) {
      hooks.update(result.timestep.tick - result.steps + i + 1);
    }
    ts = result.timestep;
    hooks.render();
    rafId = requestAnimationFrame(frame);
  };
  rafId = requestAnimationFrame(frame);

  return () => cancelAnimationFrame(rafId);
}

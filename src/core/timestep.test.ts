import { describe, expect, it } from 'vitest';
import { advance, createTimestep, MAX_FRAME_MS, SIM_TICK_MS } from './timestep';

describe('fixed timestep', () => {
  it('accumulates sub-tick frames without stepping', () => {
    let ts = createTimestep();
    const r1 = advance(ts, 60);
    expect(r1.steps).toBe(0);
    const r2 = advance(r1.timestep, 60);
    expect(r2.steps).toBe(1);
    expect(r2.timestep.accumulator).toBe(20);
    expect(r2.timestep.tick).toBe(1);
  });

  it('runs multiple steps for a long frame', () => {
    const r = advance(createTimestep(), 350);
    expect(r.steps).toBe(3);
    expect(r.timestep.accumulator).toBe(50);
  });

  it('clamps a huge elapsed time (backgrounded tab)', () => {
    const r = advance(createTimestep(), 60_000);
    expect(r.steps).toBe(MAX_FRAME_MS / SIM_TICK_MS);
  });

  it('ignores negative elapsed time', () => {
    const r = advance(createTimestep(), -50);
    expect(r.steps).toBe(0);
    expect(r.timestep.accumulator).toBe(0);
  });

  it('60fps frames produce exactly 10 ticks per simulated second', () => {
    let ts = createTimestep();
    let steps = 0;
    // 60 frames of 16.6667ms ≈ 1000ms
    for (let i = 0; i < 60; i++) {
      const r = advance(ts, 1000 / 60);
      steps += r.steps;
      ts = r.timestep;
    }
    expect(steps).toBe(10);
    expect(ts.tick).toBe(10);
  });
});

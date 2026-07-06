import { describe, expect, it } from 'vitest';
import { Dir } from '@/core/grid';
import { parseMap } from '@/core/mapParser';
import { buildScene, type WallSlot } from '@/render/scene';
import { level1 } from '@/data/maps/level1';

function find(slots: WallSlot[], row: number, lat: number): WallSlot | undefined {
  return slots.find((s) => s.row === row && s.lat === lat);
}

describe('buildScene — straight corridor (dead end ahead)', () => {
  // Party faces North up a 1-wide corridor that dead-ends after 2 cells.
  const level = parseMap({ name: 'corridor-n', ascii: '###\n#.#\n#.#\n#^#\n###' });
  const slots = buildScene(level, level.start);

  it('lists the three open cells back-to-front', () => {
    expect(slots.map((s) => `${s.row},${s.lat}`)).toEqual(['2,0', '1,0', '0,0']);
  });

  it('flanks both cells with side walls and no front until the dead end', () => {
    expect(find(slots, 0, 0)).toMatchObject({ front: false, left: true, right: true });
    expect(find(slots, 1, 0)).toMatchObject({ front: false, left: true, right: true });
    expect(find(slots, 2, 0)).toMatchObject({ front: true, left: true, right: true });
  });
});

describe('buildScene — facing is applied consistently', () => {
  // Same corridor geometry rotated East; the draw list must be identical.
  const level = parseMap({ name: 'corridor-e', ascii: '#####\n#>..#\n#####' });
  const slots = buildScene(level, level.start);

  it('produces the same slots/walls as the North corridor', () => {
    expect(slots.map((s) => `${s.row},${s.lat}`)).toEqual(['2,0', '1,0', '0,0']);
    expect(find(slots, 2, 0)).toMatchObject({ front: true, left: true, right: true });
    expect(find(slots, 0, 0)).toMatchObject({ front: false, left: true, right: true });
  });
});

describe('buildScene — open room lateral funnel', () => {
  const level = parseMap({ name: 'room', ascii: '#####\n#...#\n#...#\n#.^.#\n#####' });
  const slots = buildScene(level, level.start);

  it('sees the far wall dead ahead', () => {
    expect(find(slots, 2, 0)?.front).toBe(true);
  });

  it('sees flanking cells and their border walls (funnel visibility)', () => {
    expect(find(slots, 1, 1)).toMatchObject({ right: true });
    expect(find(slots, 1, -1)).toMatchObject({ left: true });
  });
});

describe('buildScene — a thin edge wall counts as a front wall', () => {
  const level = parseMap(level1);
  // (1,1)->(2,1) is blocked by an edge wall though both cells are floor.
  const slots = buildScene(level, { pos: { x: 1, y: 1 }, facing: Dir.E });

  it('marks the near cell front wall from the edge, not a solid', () => {
    expect(find(slots, 0, 0)?.front).toBe(true);
  });
});

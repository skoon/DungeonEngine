import { describe, expect, it } from 'vitest';
import { Dir } from '@/core/grid';
import { cellTriggerAt, floorCount, reachableCells } from '@/core/dungeon';
import { parseMap } from '@/core/mapParser';
import { level5 } from '@/data/maps/level5';

const level = parseMap(level5);

describe("level 5 — The Lich's Sanctum (M14)", () => {
  it('parses to the expected shape and uses the sanctum tileset', () => {
    expect(level.width).toBe(17);
    expect(level.height).toBe(13);
    expect(level.tileset).toBe('sanctum');
  });

  it('is a boss finale with no wander loop', () => {
    expect(level.wander).toBeUndefined();
  });

  it('is fully walkable and connected from the arrival cell', () => {
    const reached = reachableCells(level, { x: 1, y: 1 });
    expect(reached.size).toBe(floorCount(level));
  });

  it('sets the Lich in an open chamber with a 2-ghoul escort', () => {
    const lich = level.spawns.find((s) => s.species.id === 'lich');
    expect(lich).toBeDefined();
    expect(lich?.pos).toEqual({ x: 9, y: 8 });
    // Open floor on all four sides for phase summons (findSpawnSpot).
    const w = level.width;
    for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]] as const) {
      expect(level.cells[(8 + dy) * w + (9 + dx)]?.solid).toBe(false);
    }
    const ghouls = level.spawns.filter((s) => s.species.id === 'ghoul');
    expect(ghouls).toHaveLength(2);
    expect(level.spawns.filter((s) => s.species.id === 'wraith')).toHaveLength(2);
  });

  it('has stairs back up to the Necropolis and no down-stair', () => {
    const up = cellTriggerAt(level, 3, 1);
    expect(up?.kind).toBe('stairs');
    expect(up?.link).toEqual({ level: 3, pos: { x: 13, y: 11 }, facing: Dir.W });
    const downLinks = level.cells.filter(
      (c) => c.trigger?.kind === 'stairs' && c.trigger.link && c.trigger.link.level > 4,
    );
    expect(downLinks).toHaveLength(0);
  });
});

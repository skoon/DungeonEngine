import { describe, expect, it } from 'vitest';
import { Dir } from '@/core/grid';
import { cellTriggerAt, floorCount, reachableCells } from '@/core/dungeon';
import { parseMap } from '@/core/mapParser';
import { MONSTERS } from '@/data/monsters';
import { dungeonMaps } from '@/data/maps';
import { level2 } from '@/data/maps/level2';

const level = parseMap(level2);

describe('level 2 — The Sunless Crypt (M10)', () => {
  it('uses the crypt tileset', () => {
    expect(level.tileset).toBe('crypt');
  });

  it('is fully walkable and connected from the pit-landing cell', () => {
    // The party never "starts" here; it's dropped at (6,4). Everything should
    // be reachable from there.
    const reached = reachableCells(level, { x: 6, y: 4 });
    expect(reached.size).toBe(floorCount(level));
  });

  it('spawns the new bestiary including the boss', () => {
    const ids = level.spawns.map((s) => s.species.id);
    expect(ids).toContain('giant_rat');
    expect(ids).toContain('cave_spider');
    expect(ids).toContain('zombie');
    expect(ids).toContain('wraith');
    expect(ids).toContain('bone_lord');
    // The boss is not on the pit-landing cell.
    const boss = level.spawns.find((s) => s.species.id === 'bone_lord')!;
    expect(boss.pos).not.toEqual({ x: 6, y: 4 });
  });

  it('has an altar and stairs back to level 0', () => {
    expect(cellTriggerAt(level, 1, 7)?.kind).toBe('altar');
    const stairs = cellTriggerAt(level, 11, 7);
    expect(stairs?.kind).toBe('stairs');
    expect(stairs?.link).toEqual({ level: 0, pos: { x: 1, y: 1 }, facing: Dir.E });
  });

  it('has a down-stair to the Catacombs beyond the Bone Lord (M14)', () => {
    const down = cellTriggerAt(level, 10, 7);
    expect(down?.kind).toBe('stairs');
    expect(down?.link).toEqual({ level: 2, pos: { x: 1, y: 1 }, facing: Dir.E });
  });
});

describe('monster registry (M10)', () => {
  it('registers the original crypt-era species', () => {
    // Subset check: the bestiary grows with new milestones (M14+); the full
    // registry is audited in tests/data/monsters.test.ts.
    const ids = Object.keys(MONSTERS);
    for (const id of ['bone_lord', 'cave_spider', 'giant_rat', 'kobold', 'skeleton', 'wraith', 'zombie']) {
      expect(ids).toContain(id);
    }
  });
});

describe('dungeon maps', () => {
  it('all maps parse without error', () => {
    expect(dungeonMaps).toHaveLength(6); // five dungeon floors + the Town Hub
    for (const m of dungeonMaps) expect(() => parseMap(m)).not.toThrow();
  });
});

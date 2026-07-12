import { describe, expect, it } from 'vitest';
import { Dir } from '@/core/grid';
import { cellTriggerAt, floorCount, reachableCells } from '@/core/dungeon';
import { parseMap } from '@/core/mapParser';
import { level4 } from '@/data/maps/level4';

const level = parseMap(level4);

describe('level 4 — The Necropolis (M14)', () => {
  it('parses to the expected shape and uses the catacomb tileset', () => {
    expect(level.width).toBe(17);
    expect(level.height).toBe(13);
    expect(level.tileset).toBe('catacomb');
  });

  it('is a grind floor with a wander loop', () => {
    expect(level.wander).toEqual({ maxAlive: 3, everyMs: 6000 });
  });

  it('is fully walkable and connected from the arrival cell', () => {
    const reached = reachableCells(level, { x: 1, y: 1 });
    expect(reached.size).toBe(floorCount(level));
  });

  it('funnels the descent through the golem chokepoint (8,7)', () => {
    // The down-stairs chamber (region B) is only reachable via (8,7); block
    // that single cell and it should become unreachable.
    const w = level.width;
    const patched = { ...level, cells: level.cells.map((c) => ({ ...c })) };
    patched.cells[7 * w + 8] = { solid: true };
    const reached = reachableCells(patched, { x: 1, y: 1 });
    expect(reached.has(11 * w + 14)).toBe(false); // (14,11) down-stairs sealed off
  });

  it('parks the Stone Golem on the chokepoint and snipers on the corridors', () => {
    const golem = level.spawns.find((s) => s.species.id === 'stone_golem');
    expect(golem?.pos).toEqual({ x: 8, y: 7 });
    const ids = level.spawns.map((s) => s.species.id);
    expect(ids.filter((id) => id === 'necromancer')).toHaveLength(2);
    expect(ids).toContain('wraith');
    expect(ids).toContain('ghoul');
  });

  it('has an altar and stairs both directions', () => {
    expect(cellTriggerAt(level, 4, 3)?.kind).toBe('altar');
    const up = cellTriggerAt(level, 1, 4);
    expect(up?.kind).toBe('stairs');
    expect(up?.link).toEqual({ level: 2, pos: { x: 12, y: 9 }, facing: Dir.W });
    const down = cellTriggerAt(level, 14, 11);
    expect(down?.kind).toBe('stairs');
    expect(down?.link).toEqual({ level: 4, pos: { x: 1, y: 1 }, facing: Dir.E });
  });
});

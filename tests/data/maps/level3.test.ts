import { describe, expect, it } from 'vitest';
import { Dir } from '@/core/grid';
import { cellTriggerAt, edgeKey, floorCount, reachableCells } from '@/core/dungeon';
import { parseMap } from '@/core/mapParser';
import { level3 } from '@/data/maps/level3';

const level = parseMap(level3);

describe('level 3 — The Catacombs (M14)', () => {
  it('parses to the expected shape and uses the catacomb tileset', () => {
    expect(level.width).toBe(15);
    expect(level.height).toBe(11);
    expect(level.tileset).toBe('catacomb');
  });

  it('is a grind floor with a wander loop', () => {
    expect(level.wander).toEqual({ maxAlive: 3, everyMs: 6000 });
  });

  it('is fully walkable and connected from the arrival cell', () => {
    // The secret door seals only a shortcut; the east/west divider passages
    // keep every floor cell reachable at parse time.
    const reached = reachableCells(level, { x: 1, y: 1 });
    expect(reached.size).toBe(floorCount(level));
  });

  it('the central passage starts sealed by a secret door', () => {
    const door = level.edges.get(edgeKey(7, 4, Dir.S));
    expect(door?.kind).toBe('door');
    expect(door?.door?.secret).toBe(true);
    expect(door?.blocksMovement).toBe(true);
  });

  it('spawns ghoul + crypt-bat territory with a lurking spider', () => {
    const ids = level.spawns.map((s) => s.species.id);
    expect(ids).toContain('ghoul');
    expect(ids).toContain('crypt_bat');
    expect(ids).toContain('cave_spider');
    expect(ids.filter((id) => id === 'ghoul')).toHaveLength(3);
  });

  it('links up to the Sunless Crypt and down to the Necropolis', () => {
    const up = cellTriggerAt(level, 2, 1);
    expect(up?.kind).toBe('stairs');
    expect(up?.link).toEqual({ level: 1, pos: { x: 9, y: 7 }, facing: Dir.N });
    const down = cellTriggerAt(level, 13, 9);
    expect(down?.kind).toBe('stairs');
    expect(down?.link).toEqual({ level: 3, pos: { x: 1, y: 1 }, facing: Dir.E });
  });
});

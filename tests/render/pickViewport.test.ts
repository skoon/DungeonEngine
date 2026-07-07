import { describe, expect, it } from 'vitest';
import { Dir } from '@/core/grid';
import { parseMap } from '@/core/mapParser';
import { pickViewport } from '@/render/viewport';
import { centroid, floorQuad, frontRect } from '@/render/viewGeometry';
import type { MonsterSpecies } from '@/core/monster';
import { spawnMonster } from '@/core/monster';

function species(): MonsterSpecies {
  return {
    id: 't', name: 'T', glyph: 'T', color: '#fff', maxHp: 5, ac: 10, attackBonus: 0,
    damage: [1, 2], moveMs: 900, attackMs: 900, sight: 6, xp: 1, ai: 'dumb',
  };
}

describe('pickViewport hit-testing', () => {
  it('clicking a monster in the cell ahead returns attack', () => {
    // Party at (1,1) facing East; the cell ahead (2,1) is frustum (row1,lat0).
    const level = parseMap({ name: 'hall', ascii: '#####\n#>..#\n#####' });
    const monsters = [spawnMonster({ pos: { x: 2, y: 1 }, facing: Dir.W, species: species() })];
    const c = centroid(floorQuad(1, 0));
    const pick = pickViewport(level, level.start, monsters, { x: c.x, y: c.y - 20 });
    expect(pick).toEqual({ kind: 'attack' });
  });

  it('clicking a wall button ahead returns use', () => {
    const level = parseMap({
      name: 'btn',
      ascii: '###\n#>#\n###',
      edges: [{ x: 1, y: 1, dir: Dir.E, interact: { kind: 'button', actions: [] } }],
    });
    const r = frontRect(0, 0);
    const pick = pickViewport(level, level.start, [], { x: (r.x0 + r.x1) / 2, y: (r.y0 + r.y1) / 2 });
    expect(pick).toEqual({ kind: 'use' });
  });

  it('clicking floor items in the current cell returns floor', () => {
    const level = parseMap({
      name: 'loot',
      ascii: '#####\n#>..#\n#####',
      floor: [{ x: 1, y: 1, items: [{ tpl: { id: 'g', name: 'Gem', glyph: '*', color: '#fff', slot: 'misc', weight: 1 } }] }],
    });
    const c = centroid(floorQuad(0, 0));
    expect(pickViewport(level, level.start, [], { x: c.x, y: c.y })).toEqual({ kind: 'floor' });
  });

  it('clicking empty space returns null', () => {
    const level = parseMap({ name: 'hall', ascii: '#####\n#>..#\n#####' });
    expect(pickViewport(level, level.start, [], { x: 220, y: 20 })).toBeNull();
  });
});

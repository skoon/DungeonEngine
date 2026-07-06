import { describe, expect, it } from 'vitest';
import { Dir } from '@/core/grid';
import { edgeKey, type Level } from '@/core/dungeon';
import { parseMap } from '@/core/mapParser';
import { EventBus } from '@/core/events';
import { Rng } from '@/core/rng';
import { World } from '@/core/world';
import { level1 } from '@/data/maps/level1';

const level = parseMap(level1);

describe('level 1 — The Pillared Hall', () => {
  it('parses to the expected shape and start', () => {
    expect(level.width).toBe(13);
    expect(level.height).toBe(9);
    expect(level.start).toEqual({ pos: { x: 1, y: 1 }, facing: Dir.E });
  });

  it('doors and the secret start closed; the illusion never blocks', () => {
    expect(level.edges.get(edgeKey(6, 4, Dir.N))?.blocksMovement).toBe(true); // D1
    expect(level.edges.get(edgeKey(8, 6, Dir.E))?.blocksMovement).toBe(true); // D2
    expect(level.edges.get(edgeKey(4, 5, Dir.E))?.blocksMovement).toBe(true); // secret
    expect(level.edges.get(edgeKey(3, 3, Dir.N))?.blocksMovement).toBe(false); // illusion
  });

  it('the exit cell is sealed off (teleporter-only)', () => {
    // (11,6) has no walkable neighbour — you can only reach it by teleport.
    expect(level.cells[6 * 13 + 10]?.solid).toBe(true); // (10,6)
    expect(level.cells[5 * 13 + 11]?.solid).toBe(true); // (11,5)
    expect(level.cells[7 * 13 + 11]?.solid).toBe(true); // (11,7)
  });
});

/** F step forward, l/r turn, u use; spaces ignored. */
function drive(world: World, tokens: string): void {
  for (const t of tokens) {
    if (t === 'F') world.stepForward();
    else if (t === 'l') world.turnLeft();
    else if (t === 'r') world.turnRight();
    else if (t === 'u') world.use();
    else if (t === ' ') continue;
    else throw new Error(`bad token '${t}'`);
  }
}

function fresh(): { world: World; log: string[]; level: Level } {
  const lvl = parseMap(level1);
  const bus = new EventBus();
  const log: string[] = [];
  bus.on('log/message', (e) => log.push(e.text));
  return { world: new World(lvl, bus, new Rng(7)), log, level: lvl };
}

describe('level 1 is solvable start to finish', () => {
  it('plate opens D1, button opens D2, teleporter reaches the exit', () => {
    const { world, log } = fresh();
    // to the plate; through the inner door; across to the button; open D2;
    // into the teleport booth; warp to the exit.
    drive(world, 'FFFFF r FFFFFF r FFFF l u l FFFFFF l F r F');
    expect(world.party.getPose().pos).toEqual({ x: 11, y: 6 });
    expect(log.some((l) => /escaped the Pillared Hall/i.test(l))).toBe(true);
  });

  it('the teleport-booth door stays shut until the button is used', () => {
    const { world, level: lvl } = fresh();
    drive(world, 'FFFFF r FFFFFF'); // down through D1 into the lower hall
    expect(lvl.edges.get(edgeKey(8, 6, Dir.E))?.blocksMovement).toBe(true);
  });

  it('the pit trap fires party/fell', () => {
    const lvl = parseMap(level1);
    const bus = new EventBus();
    let fell = false;
    bus.on('party/fell', () => (fell = true));
    const world = new World(lvl, bus, new Rng(1));
    drive(world, 'FFFFF r FFFFF r FFF'); // into the lower hall, west onto (3,6)
    expect(fell).toBe(true);
  });
});

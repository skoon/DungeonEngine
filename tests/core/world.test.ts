import { describe, expect, it, vi } from 'vitest';
import { Dir } from '@/core/grid';
import { EventBus } from '@/core/events';
import { edgeKey, type Level } from '@/core/dungeon';
import { parseMap, type MapSource } from '@/core/mapParser';
import { Rng } from '@/core/rng';
import { World } from '@/core/world';

function setup(source: MapSource): { world: World; level: Level; log: string[]; bus: EventBus } {
  const level = parseMap(source);
  const bus = new EventBus();
  const log: string[] = [];
  bus.on('log/message', (e) => log.push(e.text));
  const world = new World(level, bus, new Rng(1));
  return { world, level, log, bus };
}

const ROW = '#####\n#>..#\n#####'; // party (1,1) facing E, open to (3,1)

describe('doors block movement and open via a button', () => {
  const source: MapSource = {
    name: 'door',
    ascii: ROW,
    edges: [
      { x: 2, y: 1, dir: Dir.E, kind: 'door' }, // closed door between (2,1)-(3,1)
      { x: 1, y: 1, dir: Dir.N, interact: { kind: 'button', actions: [{ do: 'openDoor', edge: { x: 2, y: 1, dir: Dir.E } }] } },
    ],
  };

  it('a closed door blocks, the button opens it, then you pass', () => {
    const { world } = setup(source);
    expect(world.stepForward()).toBe(true); // (1,1)->(2,1)
    expect(world.stepForward()).toBe(false); // door blocks (2,1)->(3,1)
    expect(world.party.getPose().pos).toEqual({ x: 2, y: 1 });

    world.turnRight(); // E->S ... face the button? button is on N of (1,1)
    // Walk back and press the button from the start cell.
    world.turnRight(); // S->W
    world.stepForward(); // (2,1)->(1,1)
    world.turnRight(); // W->N, now facing the button wall
    world.use();
    world.turnRight(); // N->E
    world.stepForward(); // (1,1)->(2,1)
    expect(world.stepForward()).toBe(true); // door now open (2,1)->(3,1)
    expect(world.party.getPose().pos).toEqual({ x: 3, y: 1 });
  });
});

describe('levers toggle', () => {
  it('pulling a lever toggles a door open then closed', () => {
    const { world, level } = setup({
      name: 'lever',
      ascii: ROW,
      edges: [
        { x: 2, y: 1, dir: Dir.E, kind: 'door' },
        { x: 1, y: 1, dir: Dir.N, interact: { kind: 'lever', actions: [{ do: 'toggleDoor', edge: { x: 2, y: 1, dir: Dir.E } }] } },
      ],
    });
    const door = () => level.edges.get(edgeKey(2, 1, Dir.E))?.door;
    world.turnLeft(); // E->N faces the lever
    expect(door()?.open).toBe(false);
    world.use();
    expect(door()?.open).toBe(true);
    world.use();
    expect(door()?.open).toBe(false);
  });

  it('reports when there is nothing to use', () => {
    const { world, log } = setup({ name: 'bare', ascii: ROW });
    world.use();
    expect(log.at(-1)).toMatch(/nothing to use/i);
  });
});

describe('pressure plates fire on enter and leave', () => {
  it('runs onEnter when stepped on and onLeave when stepped off', () => {
    const { world, log } = setup({
      name: 'plate',
      ascii: ROW,
      triggers: [
        {
          x: 2,
          y: 1,
          kind: 'plate',
          onEnter: [{ do: 'message', channel: 'system', text: 'CLICK' }],
          onLeave: [{ do: 'message', channel: 'system', text: 'CLACK' }],
        },
      ],
    });
    world.stepForward(); // onto (2,1)
    expect(log).toContain('CLICK');
    world.stepForward(); // off to (3,1)
    expect(log).toContain('CLACK');
  });
});

describe('teleporters and spinners', () => {
  it('teleports the party to the target cell on entry', () => {
    const { world } = setup({
      name: 'tp',
      ascii: '#######\n#>....#\n#######',
      triggers: [{ x: 3, y: 1, kind: 'teleporter', onEnter: [{ do: 'teleport', to: { x: 5, y: 1 }, facing: Dir.S }] }],
    });
    world.stepForward(); // (2,1)
    world.stepForward(); // (3,1) -> teleport to (5,1) facing S
    expect(world.party.getPose()).toEqual({ pos: { x: 5, y: 1 }, facing: Dir.S });
  });

  it('spinner rotates facing on entry', () => {
    const { world } = setup({
      name: 'spin',
      ascii: ROW,
      triggers: [{ x: 2, y: 1, kind: 'spinner', onEnter: [{ do: 'spin', facing: Dir.S }] }],
    });
    world.stepForward();
    expect(world.party.getPose().facing).toBe(Dir.S);
  });
});

describe('pits and illusions', () => {
  it('a pit emits party/fell on entry', () => {
    const { world, bus } = setup({
      name: 'pit',
      ascii: ROW,
      triggers: [{ x: 2, y: 1, kind: 'pit' }],
    });
    const fell = vi.fn();
    bus.on('party/fell', fell);
    world.stepForward();
    expect(fell).toHaveBeenCalledOnce();
  });

  it('an illusory wall is walked through with a hint', () => {
    const { world, log } = setup({
      name: 'illusion',
      ascii: ROW,
      edges: [{ x: 1, y: 1, dir: Dir.E, kind: 'illusion' }],
    });
    expect(world.stepForward()).toBe(true);
    expect(world.party.getPose().pos).toEqual({ x: 2, y: 1 });
    expect(log.some((l) => /illusion/i.test(l))).toBe(true);
  });
});

describe('door animation', () => {
  it('progress slides toward open after ticks', () => {
    const { world, level } = setup({
      name: 'anim',
      ascii: ROW,
      edges: [
        { x: 2, y: 1, dir: Dir.E, kind: 'door' },
        { x: 1, y: 1, dir: Dir.N, interact: { kind: 'button', actions: [{ do: 'openDoor', edge: { x: 2, y: 1, dir: Dir.E } }] } },
      ],
    });
    const door = () => level.edges.get(edgeKey(2, 1, Dir.E))!.door!;
    world.turnLeft();
    world.use(); // open
    expect(door().progress).toBe(0);
    world.tick(500);
    expect(door().progress).toBe(1);
  });
});

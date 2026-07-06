/**
 * World — the interactive layer over Party + Level (plan §5). Movement goes
 * through here so triggers fire: pressure plates on enter/leave, teleporters
 * and spinners that relocate/rotate the party, pits, wall text, and illusory
 * walls you pass straight through. `use()` operates the wall directly ahead
 * (button/lever). Door animations advance on tick().
 *
 * All behaviour is driven by the data Actions authored in the map, so puzzles
 * are content, not code.
 */

import { type Dir, type Vec2 } from './grid';
import { type EdgeWall, type Level, cellTriggerAt, edgeAt } from './dungeon';
import { Party, type StepDir, stepDirection } from './party';
import type { EventBus, LogChannel } from './events';
import type { Action, EdgeAddr } from './triggers';
import type { Rng } from './rng';
import type { Roster } from './roster';

const DOOR_RATE = 0.006; // progress units per ms (~170ms open/close)
const MAX_TELEPORT_HOPS = 8;

export class World {
  readonly party: Party;

  constructor(
    private readonly level: Level,
    private readonly bus: EventBus,
    private readonly rng: Rng,
    private readonly roster?: Roster,
  ) {
    this.party = new Party(level, bus);
  }

  stepForward(): boolean {
    return this.move('forward');
  }
  stepBack(): boolean {
    return this.move('back');
  }
  strafeLeft(): boolean {
    return this.move('left');
  }
  strafeRight(): boolean {
    return this.move('right');
  }
  turnLeft(): void {
    this.party.turnLeft();
    this.checkFacingText();
  }
  turnRight(): void {
    this.party.turnRight();
    this.checkFacingText();
  }

  /** Advance door slide animations. */
  tick(dtMs: number): void {
    for (const edge of this.level.edges.values()) {
      if (edge.kind !== 'door' || !edge.door) continue;
      const target = edge.door.open ? 1 : 0;
      const d = dtMs * DOOR_RATE;
      if (edge.door.progress < target) edge.door.progress = Math.min(target, edge.door.progress + d);
      else if (edge.door.progress > target) edge.door.progress = Math.max(target, edge.door.progress - d);
    }
  }

  /** Operate whatever the party is facing: button/lever, keyhole, or alcove. */
  use(): void {
    const { pos, facing } = this.party.getPose();
    const edge = edgeAt(this.level, pos.x, pos.y, facing);

    if (edge?.interact) {
      this.useInteractable(edge.interact);
      return;
    }
    if (edge?.kind === 'door' && edge.door && !edge.door.open && edge.door.keyId) {
      this.useKeyhole(edge.door.keyId, { x: pos.x, y: pos.y, dir: facing });
      return;
    }
    if (edge?.alcove && edge.alcove.length > 0) {
      this.lootAlcove(edge);
      return;
    }
    this.msg('system', 'There is nothing to use here.');
  }

  private useInteractable(it: NonNullable<EdgeWall['interact']>): void {
    if (it.oneShot && it.used) {
      this.msg('system', "It won't budge.");
      return;
    }
    it.used = true;
    if (it.kind === 'lever') it.on = !it.on;
    this.bus.emit({ type: 'interact/used', kind: it.kind });
    this.msg('system', it.kind === 'lever' ? 'You pull the lever.' : 'You press the button.');
    this.run(it.actions);
  }

  private useKeyhole(keyId: string, addr: EdgeAddr): void {
    if (this.partyHasKey(keyId)) {
      this.setDoor(addr, true);
      this.msg('system', `You unlock the door with the ${keyId} key.`);
    } else {
      this.bus.emit({ type: 'door/locked', keyId });
      this.msg('system', 'The door is locked. You need a key.');
    }
  }

  private lootAlcove(edge: EdgeWall): void {
    if (!this.roster) return;
    const remaining: NonNullable<EdgeWall['alcove']> = [];
    for (const it of edge.alcove ?? []) {
      if (this.roster.stow(it)) {
        this.bus.emit({ type: 'item/taken', name: it.tpl.name });
        this.msg('loot', `You take the ${it.tpl.name}.`);
      } else {
        remaining.push(it);
      }
    }
    edge.alcove = remaining;
    if (remaining.length > 0) this.msg('system', 'Your packs are full.');
  }

  private partyHasKey(keyId: string): boolean {
    if (!this.roster) return false;
    for (const c of this.roster.members) {
      const held = [...c.hands, ...c.backpack, ...Object.values(c.equipment)];
      if (held.some((it) => it?.tpl.keyId === keyId)) return true;
    }
    return false;
  }

  private move(step: StepDir): boolean {
    const before = { ...this.party.getPose().pos };
    const dir = stepDirection(this.party.getPose().facing, step);
    if (!this.party.step(step)) return false;

    const crossed = edgeAt(this.level, before.x, before.y, dir);
    if (crossed?.kind === 'illusion') {
      this.msg('ambient', 'Your hand passes through the wall — it is an illusion!');
    }
    this.leaveCell(before);
    this.enterCell({ ...this.party.getPose().pos }, 0);
    this.checkFacingText();
    return true;
  }

  /** Read out an engraving when the party turns to face it (once per look). */
  private checkFacingText(): void {
    const { pos, facing } = this.party.getPose();
    const text = edgeAt(this.level, pos.x, pos.y, facing)?.text;
    if (text && text !== this.lastText) {
      this.msg('ambient', `Engraved on the wall: ${text}`);
      this.lastText = text;
    } else if (!text) {
      this.lastText = undefined;
    }
  }

  private lastText: string | undefined;

  private leaveCell(pos: Vec2): void {
    const t = cellTriggerAt(this.level, pos.x, pos.y);
    if (t?.onLeave) this.run(t.onLeave);
  }

  private enterCell(pos: Vec2, hops: number): void {
    if (hops > MAX_TELEPORT_HOPS) {
      this.msg('system', 'You feel hopelessly disoriented.');
      return;
    }
    const t = cellTriggerAt(this.level, pos.x, pos.y);
    if (!t) return;
    if (t.text) this.msg('ambient', t.text);
    if (t.kind === 'pit') {
      this.bus.emit({ type: 'party/fell' });
      this.msg('damage', 'The floor gives way — you plunge into a pit!');
      if (this.roster) {
        for (let i = 0; i < this.roster.members.length; i++) {
          this.roster.damage(i, this.rng.dice(1, 6), this.bus);
        }
      }
    }
    if (t.onEnter) {
      this.run(t.onEnter);
      // A teleport/stairs action may have moved us; process the new cell too.
      const after = this.party.getPose().pos;
      if (after.x !== pos.x || after.y !== pos.y) {
        this.enterCell({ ...after }, hops + 1);
      }
    }
  }

  private run(actions: Action[]): void {
    for (const action of actions) this.exec(action);
  }

  private exec(action: Action): void {
    switch (action.do) {
      case 'openDoor':
        this.setDoor(action.edge, true);
        break;
      case 'closeDoor':
        this.setDoor(action.edge, false);
        break;
      case 'toggleDoor': {
        const e = edgeAt(this.level, action.edge.x, action.edge.y, action.edge.dir);
        this.setDoor(action.edge, !(e?.door?.open ?? false));
        break;
      }
      case 'teleport':
        this.party.teleport(action.to, action.facing);
        break;
      case 'spin': {
        const facing =
          action.facing === 'random' ? (this.rng.int(0, 3) as Dir) : action.facing;
        this.party.setFacing(facing);
        break;
      }
      case 'message':
        this.msg(action.channel, action.text);
        break;
    }
  }

  private setDoor(addr: EdgeAddr, open: boolean): void {
    const edge = edgeAt(this.level, addr.x, addr.y, addr.dir);
    if (!edge || edge.kind !== 'door' || !edge.door) return;
    edge.door.open = open;
    edge.blocksMovement = !open;
    // The edge is stored under one canonical key shared by both neighbours,
    // so this single mutation keeps the two sides consistent (plan §9).
    this.bus.emit({ type: 'door/toggled', x: addr.x, y: addr.y, dir: addr.dir, open });
  }

  private msg(channel: LogChannel, text: string): void {
    this.bus.emit({ type: 'log/message', channel, text });
  }
}

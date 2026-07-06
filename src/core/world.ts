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

import { type Dir, type Vec2, translate } from './grid';
import { type EdgeWall, type Level, cellAt, cellTriggerAt, edgeAt } from './dungeon';
import { Party, type StepDir, stepDirection } from './party';
import { type Monster, decideState, spawnMonster } from './monster';
import { resolveAttack, rollDamage } from './combat';
import { type Blocked, manhattan, stepAway, stepToward } from './path';
import { armorClass, attackBonus, isDisabled, statMod, weaponDamage } from './character';
import { isWeapon } from './item';
import type { EventBus, LogChannel } from './events';
import type { Action, EdgeAddr } from './triggers';
import type { Rng } from './rng';
import type { Roster } from './roster';

const DOOR_RATE = 0.006; // progress units per ms (~170ms open/close)
const MAX_TELEPORT_HOPS = 8;
const MONSTER_FLASH_MS = 180;

export class World {
  readonly party: Party;
  readonly monsters: Monster[];

  constructor(
    private readonly level: Level,
    private readonly bus: EventBus,
    private readonly rng: Rng,
    private readonly roster?: Roster,
  ) {
    this.party = new Party(level, bus);
    this.monsters = level.spawns.map(spawnMonster);
  }

  monsterAt(x: number, y: number): Monster | undefined {
    return this.monsters.find((m) => m.state !== 'dead' && m.pos.x === x && m.pos.y === y);
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

  /** Advance doors, attack cooldowns, hurt flashes, and monster AI. */
  tick(dtMs: number): void {
    for (const edge of this.level.edges.values()) {
      if (edge.kind !== 'door' || !edge.door) continue;
      const target = edge.door.open ? 1 : 0;
      const d = dtMs * DOOR_RATE;
      if (edge.door.progress < target) edge.door.progress = Math.min(target, edge.door.progress + d);
      else if (edge.door.progress > target) edge.door.progress = Math.max(target, edge.door.progress - d);
    }
    if (this.roster) {
      for (const c of this.roster.members) {
        c.cooldowns[0] = Math.max(0, c.cooldowns[0] - dtMs);
        c.cooldowns[1] = Math.max(0, c.cooldowns[1] - dtMs);
      }
      this.roster.tickFlash(dtMs);
    }
    this.updateMonsters(dtMs);
  }

  /** Attack the monster in the cell directly ahead with member `index`. */
  attack(index: number): void {
    if (!this.roster) return;
    const c = this.roster.member(index);
    if (!c || isDisabled(c)) return;

    const weaponHand = c.hands.findIndex((h) => h && isWeapon(h));
    const hand: 0 | 1 = weaponHand === 1 ? 1 : 0;
    if ((c.cooldowns[hand] ?? 0) > 0) {
      this.msg('system', `${c.name} is not ready.`);
      return;
    }
    const weapon = c.hands[hand];
    if (index >= 2 && !(weapon && weapon.tpl.reach)) {
      this.msg('system', `${c.name} can't reach from the back rank.`);
      return;
    }

    const { pos, facing } = this.party.getPose();
    const ahead = translate(pos, facing);
    const m = this.monsterAt(ahead.x, ahead.y);
    c.cooldowns[hand] = weapon?.tpl.cooldownMs ?? 500;

    if (!m) {
      this.msg('combat', `${c.name} swings at empty air.`);
      return;
    }
    const roll = resolveAttack(this.rng, attackBonus(c), m.species.ac);
    if (roll.hit) {
      const dmg = rollDamage(this.rng, weaponDamage(c, hand), statMod(c.stats.str));
      this.bus.emit({ type: 'attack/resolved', by: 'party', hit: true, damage: dmg });
      this.msg('combat', `${c.name} hits the ${m.species.name} for ${dmg}.`);
      m.flash = MONSTER_FLASH_MS;
      m.hp.cur -= dmg;
      if (m.hp.cur <= 0) this.killMonster(m);
    } else {
      this.bus.emit({ type: 'attack/resolved', by: 'party', hit: false, damage: 0 });
      this.msg('combat', `${c.name} misses the ${m.species.name}.`);
    }
  }

  private killMonster(m: Monster): void {
    m.state = 'dead';
    this.bus.emit({ type: 'monster/died', name: m.species.name, xp: m.species.xp });
    this.msg('loot', `The ${m.species.name} is destroyed! (+${m.species.xp} XP)`);
    if (this.roster) for (const c of this.roster.members) c.xp += m.species.xp;
    const drops = m.species.loot?.() ?? [];
    if (drops.length > 0) {
      const cell = cellAt(this.level, m.pos.x, m.pos.y);
      if (cell) cell.items = [...(cell.items ?? []), ...drops];
    }
  }

  private updateMonsters(dtMs: number): void {
    const partyPos = this.party.getPose().pos;
    for (const m of this.monsters) {
      if (m.state === 'dead') continue;
      m.flash = Math.max(0, m.flash - dtMs);
      const blocked: Blocked = (x, y) =>
        (x === partyPos.x && y === partyPos.y) ||
        this.monsters.some((o) => o !== m && o.state !== 'dead' && o.pos.x === x && o.pos.y === y);
      const adjacent = manhattan(m.pos, partyPos) === 1;
      const canSee =
        adjacent || stepToward(this.level, m.pos, partyPos, blocked, m.species.sight) !== null;
      m.state = decideState(m, { adjacent, canSee });
      if (m.state === 'idle') continue;

      m.moveTimer -= dtMs;
      m.attackTimer -= dtMs;

      if (m.state === 'attack') {
        m.facing = faceToward(m.pos, partyPos);
        if (m.attackTimer <= 0 && adjacent) {
          this.monsterAttack(m);
          m.attackTimer = m.species.attackMs;
        }
      } else if (m.moveTimer <= 0) {
        const dir =
          m.state === 'flee'
            ? stepAway(this.level, m.pos, partyPos, blocked)
            : stepToward(this.level, m.pos, partyPos, blocked, m.species.sight);
        if (dir !== null) {
          m.facing = dir;
          m.pos = translate(m.pos, dir);
        }
        m.moveTimer = m.species.moveMs;
      }
    }
    for (let i = this.monsters.length - 1; i >= 0; i--) {
      if (this.monsters[i]!.state === 'dead') this.monsters.splice(i, 1);
    }
  }

  private monsterAttack(m: Monster): void {
    if (!this.roster) return;
    const members = this.roster.members;
    const alive = (i: number): boolean => !!members[i] && !isDisabled(members[i]!);
    const front = [0, 1].filter(alive);
    const pool = front.length > 0 ? front : [0, 1, 2, 3].filter(alive);
    if (pool.length === 0) {
      this.bus.emit({ type: 'party/wiped' });
      return;
    }
    const idx = pool[this.rng.int(0, pool.length - 1)]!;
    const c = members[idx]!;
    const roll = resolveAttack(this.rng, m.species.attackBonus, armorClass(c));
    if (roll.hit) {
      const dmg = rollDamage(this.rng, m.species.damage, 0);
      this.bus.emit({ type: 'attack/resolved', by: 'monster', hit: true, damage: dmg });
      this.msg('damage', `The ${m.species.name} hits ${c.name} for ${dmg}.`);
      this.roster.damage(idx, dmg, this.bus);
      if (this.roster.everyoneDown()) {
        this.bus.emit({ type: 'party/wiped' });
        this.msg('damage', 'The party has fallen!');
      }
    } else {
      this.bus.emit({ type: 'attack/resolved', by: 'monster', hit: false, damage: 0 });
      this.msg('combat', `The ${m.species.name} misses ${c.name}.`);
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
    const beforePose = this.party.getPose();
    const before = { ...beforePose.pos };
    const dir = stepDirection(beforePose.facing, step);

    // A monster in the target cell bars the way — attack it instead.
    const target = translate(before, dir);
    const blocker = this.monsterAt(target.x, target.y);
    if (blocker) {
      this.bus.emit({ type: 'party/blocked', reason: 'monster', facing: beforePose.facing });
      this.msg('system', `A ${blocker.species.name} bars your way!`);
      return false;
    }

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

/** Cardinal direction from `from` toward `to` (dominant axis). */
function faceToward(from: Vec2, to: Vec2): Dir {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 1 : 3;
  return dy >= 0 ? 2 : 0;
}

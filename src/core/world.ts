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

import { type Dir, type Vec2, delta, translate, turnRight } from './grid';
import { type EdgeWall, type Level, canEnter, cellAt, cellTriggerAt, edgeAt, isWalkable } from './dungeon';
import { Party, type StepDir, stepDirection } from './party';
import { type Monster, type MonsterState, type MonsterSpecies, decideState, spawnMonster } from './monster';
import { type Projectile, spawnProjectile } from './projectile';
import { resolveAttack, rollDamage } from './combat';
import { type Blocked, manhattan, stepAway, stepToward } from './path';
import { type Character, armorClass, attackBonus, isDisabled, statMod, weaponDamage } from './character';
import { isWeapon, type Item } from './item';
import type { SpellDef } from './spell';
import type { EventBus, LogChannel } from './events';
import type { Action, EdgeAddr } from './triggers';
import type { Rng } from './rng';
import type { Roster } from './roster';

const DOOR_RATE = 0.006; // progress units per ms (~170ms open/close)
const MAX_TELEPORT_HOPS = 8;
const MONSTER_FLASH_MS = 180;

// --- Save snapshot shapes (plan §7). Items/species by registry id. ---------
export interface ItemRef {
  id: string;
  count?: number;
  charges?: number;
}
export interface EdgeSnapshot {
  doorOpen?: boolean;
  doorProgress?: number;
  used?: boolean;
  on?: boolean;
  detected?: boolean;
  alcove?: ItemRef[];
}
export interface MonsterSnapshot {
  species: string;
  x: number;
  y: number;
  facing: Dir;
  hpCur: number;
  state: MonsterState;
  moveTimer: number;
  attackTimer: number;
}
export interface LevelSnapshot {
  items: Record<string, ItemRef[]>;
  edges: Record<string, EdgeSnapshot>;
  monsters: MonsterSnapshot[];
}
export interface WorldSnapshot {
  current: number;
  party: { x: number; y: number; facing: Dir };
  litMsLeft: number;
  hunger: number;
  levels: LevelSnapshot[];
}
export interface SnapshotDeps {
  item: (ref: ItemRef) => Item;
  species: (id: string) => MonsterSpecies;
}

export class World {
  readonly party: Party;
  readonly projectiles: Projectile[] = [];

  private readonly levels: Level[];
  private readonly monstersByLevel: Monster[][];
  private current = 0;
  private litMsLeft = 0;
  private hunger = 0;

  constructor(
    levels: Level | Level[],
    private readonly bus: EventBus,
    private readonly rng: Rng,
    private readonly roster?: Roster,
  ) {
    this.levels = Array.isArray(levels) ? levels : [levels];
    this.monstersByLevel = this.levels.map((l) => l.spawns.map(spawnMonster));
    this.party = new Party(this.levels[0]!, bus);
  }

  /** The level the party is currently on. */
  get level(): Level {
    return this.levels[this.current]!;
  }

  /** Live monsters on the current level. */
  get monsters(): Monster[] {
    return this.monstersByLevel[this.current]!;
  }

  get levelIndex(): number {
    return this.current;
  }

  get levelCount(): number {
    return this.levels.length;
  }

  monsterAt(x: number, y: number): Monster | undefined {
    return this.monsters.find((m) => m.state !== 'dead' && m.pos.x === x && m.pos.y === y);
  }

  /** Whether a Light spell is currently active (plan §6.3; render hook). */
  isLit(): boolean {
    return this.litMsLeft > 0;
  }

  /** Move the party to another level (stairs/pit). Autosave hook fires via
   * the emitted event. In-flight projectiles do not follow. */
  changeLevel(index: number, pos: Vec2, facing?: Dir): void {
    if (index < 0 || index >= this.levels.length) return;
    this.current = index;
    this.projectiles.length = 0;
    this.party.enter(this.levels[index]!, pos, facing ?? this.party.getPose().facing);
    this.bus.emit({ type: 'level/changed', index, name: this.levels[index]!.name });
    this.msg('system', `You arrive at ${this.levels[index]!.name}.`);
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
        c.spellCooldown = Math.max(0, c.spellCooldown - dtMs);
        if (c.buff) {
          c.buff.msLeft -= dtMs;
          if (c.buff.msLeft <= 0) c.buff = null;
        }
      }
      this.roster.tickFlash(dtMs);
    }
    this.litMsLeft = Math.max(0, this.litMsLeft - dtMs);
    this.updateMonsters(dtMs);
    this.tickProjectiles(dtMs);
    this.pruneDead();
  }

  /** Remove monsters killed this tick, whichever system killed them
   * (melee, projectile, or a cone spell) — run once, after all of them. */
  private pruneDead(): void {
    for (let i = this.monsters.length - 1; i >= 0; i--) {
      if (this.monsters[i]!.state === 'dead') this.monsters.splice(i, 1);
    }
  }

  /**
   * Attack the monster in the cell directly ahead with member `index`. A
   * thrown weapon (dagger, etc.) with no adjacent target instead launches
   * as a projectile down the corridor — the back rank may always do this,
   * since throwing doesn't need reach the way melee does.
   */
  attack(index: number, forceHand?: 0 | 1): void {
    if (!this.roster) return;
    const c = this.roster.member(index);
    if (!c || isDisabled(c)) return;

    const autoHand = c.hands.findIndex((h) => h && isWeapon(h));
    const hand: 0 | 1 = forceHand ?? (autoHand === 1 ? 1 : 0);
    if ((c.cooldowns[hand] ?? 0) > 0) {
      this.msg('system', `${c.name} is not ready.`);
      return;
    }
    const weapon = c.hands[hand];
    const { pos, facing } = this.party.getPose();
    const ahead = translate(pos, facing);
    const m = this.monsterAt(ahead.x, ahead.y);

    if (m) {
      if (index >= 2 && !(weapon && weapon.tpl.reach)) {
        this.msg('system', `${c.name} can't reach from the back rank.`);
        return;
      }
      c.cooldowns[hand] = weapon?.tpl.cooldownMs ?? 500;
      const roll = resolveAttack(this.rng, attackBonus(c), m.species.ac);
      if (roll.hit) {
        const dmg = rollDamage(this.rng, weaponDamage(c, hand), statMod(c.stats.str));
        this.bus.emit({ type: 'attack/resolved', by: 'party', hit: true, damage: dmg });
        this.msg('combat', `${c.name} hits the ${m.species.name} for ${dmg}.`);
        this.hitMonster(m, dmg);
      } else {
        this.bus.emit({ type: 'attack/resolved', by: 'party', hit: false, damage: 0 });
        this.msg('combat', `${c.name} misses the ${m.species.name}.`);
      }
      return;
    }

    c.cooldowns[hand] = weapon?.tpl.cooldownMs ?? 500;
    if (weapon?.tpl.thrown) {
      this.throwWeapon(c, hand, weapon, facing);
    } else {
      this.msg('combat', `${c.name} swings at empty air.`);
    }
  }

  private throwWeapon(c: Character, hand: 0 | 1, weapon: Item, facing: Dir): void {
    c.hands[hand] = null; // it's in the air now — rearm from the backpack or floor
    const start = translate(this.party.getPose().pos, facing);
    this.projectiles.push(
      spawnProjectile({
        pos: start,
        dir: facing,
        from: 'party',
        attackBonus: attackBonus(c),
        damage: weapon.tpl.damage ?? [1, 2],
        damageBonus: statMod(c.stats.str),
        item: weapon,
        glyph: weapon.tpl.glyph,
        color: weapon.tpl.color,
        label: weapon.tpl.name,
      }),
    );
    this.msg('combat', `${c.name} hurls the ${weapon.tpl.name}.`);
  }

  /** Apply damage to a monster (shared by melee, projectiles, and spells). */
  private hitMonster(m: Monster, dmg: number): void {
    m.flash = MONSTER_FLASH_MS;
    m.hp.cur -= dmg;
    if (m.hp.cur <= 0) this.killMonster(m);
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

  private tickProjectiles(dtMs: number): void {
    const partyPos = this.party.getPose().pos;
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i]!;
      p.timer -= dtMs;
      let landed = false;
      let guard = 0;
      while (p.timer <= 0 && !landed && guard++ < 8) {
        p.timer += p.hopMs;
        if (!canEnter(this.level, p.pos, p.dir)) {
          this.landProjectile(p);
          landed = true;
          break;
        }
        p.pos = translate(p.pos, p.dir);
        p.range -= 1;

        if (p.from === 'party') {
          const m = this.monsterAt(p.pos.x, p.pos.y);
          if (m) {
            const roll = p.guaranteed
              ? { hit: true }
              : resolveAttack(this.rng, p.attackBonus, m.species.ac);
            if (roll.hit) {
              const dmg = rollDamage(this.rng, p.damage, p.damageBonus);
              this.bus.emit({ type: 'attack/resolved', by: 'party', hit: true, damage: dmg });
              this.msg('combat', `The ${p.label} hits the ${m.species.name} for ${dmg}.`);
              this.hitMonster(m, dmg);
            } else {
              this.bus.emit({ type: 'attack/resolved', by: 'party', hit: false, damage: 0 });
              this.msg('combat', `The ${p.label} sails past the ${m.species.name}.`);
            }
            this.landProjectile(p);
            landed = true;
            break;
          }
        } else if (p.pos.x === partyPos.x && p.pos.y === partyPos.y) {
          this.resolveProjectileVsParty(p);
          landed = true;
          break;
        }

        if (p.range <= 0) {
          this.landProjectile(p);
          landed = true;
          break;
        }
      }
      if (landed) this.projectiles.splice(i, 1);
    }
  }

  /** A monster-fired projectile reaching the party (hook for future ranged
   * monsters; no current species uses this path). */
  private resolveProjectileVsParty(p: Projectile): void {
    if (!this.roster) return;
    const idx = this.rng.int(0, this.roster.members.length - 1);
    const target = this.roster.member(idx);
    if (!target) return;
    const roll = resolveAttack(this.rng, p.attackBonus, armorClass(target));
    if (roll.hit) {
      const dmg = rollDamage(this.rng, p.damage, p.damageBonus);
      this.msg('damage', `The ${p.label} strikes ${target.name} for ${dmg}.`);
      this.roster.damage(idx, dmg, this.bus);
    } else {
      this.msg('combat', `The ${p.label} whizzes past ${target.name}.`);
    }
  }

  private landProjectile(p: Projectile): void {
    if (p.item) {
      const cell = cellAt(this.level, p.pos.x, p.pos.y);
      if (cell) cell.items = [...(cell.items ?? []), p.item];
      this.msg('ambient', `The ${p.item.tpl.name} clatters to the floor.`);
    }
  }

  /** Cast a spell `spellId` known to member `index` (plan §6.3). */
  cast(index: number, spellId: string): void {
    if (!this.roster) return;
    const c = this.roster.member(index);
    if (!c || isDisabled(c)) return;
    const def = c.spells.find((s) => s.id === spellId);
    if (!def) {
      this.msg('system', `${c.name} does not know that spell.`);
      return;
    }
    if (c.spellCooldown > 0) {
      this.msg('system', `${c.name} is not ready to cast.`);
      return;
    }
    if (c.mp.cur < def.mpCost) {
      this.msg('system', `${c.name} lacks the mana.`);
      return;
    }

    let ok = true;
    switch (def.kind) {
      case 'projectile':
        this.castBolt(c, def);
        break;
      case 'cone':
        this.castCone(c, def);
        break;
      case 'buff':
        c.buff = { acBonus: def.acBonus ?? 0, msLeft: def.buffMs ?? 10000 };
        this.msg('system', `${c.name} is warded.`);
        break;
      case 'heal':
        ok = this.castHeal(def);
        break;
      case 'light':
        this.litMsLeft = def.lightMs ?? 60000;
        this.msg('system', 'A soft light suffuses the passage.');
        break;
      case 'detect':
        this.castDetect(def);
        break;
    }
    if (!ok) return;

    c.mp.cur -= def.mpCost;
    c.spellCooldown = def.castMs;
    this.bus.emit({ type: 'spell/cast', member: index, spellId: def.id });
    this.msg('combat', `${c.name} casts ${def.name}.`);
  }

  private castBolt(c: Character, def: SpellDef): void {
    const { pos, facing } = this.party.getPose();
    this.projectiles.push(
      spawnProjectile({
        pos: translate(pos, facing),
        dir: facing,
        from: 'party',
        attackBonus: 0,
        guaranteed: true,
        damage: def.damage ?? [1, 4],
        damageBonus: statMod(c.stats.int),
        glyph: def.glyph ?? '*',
        color: def.color ?? '#41a6f6',
        label: def.name,
        hopMs: 60,
        range: 10,
      }),
    );
  }

  /** A cone hitting the three cells in the row directly ahead (plan §6.3). */
  private castCone(c: Character, def: SpellDef): void {
    const { pos, facing } = this.party.getPose();
    const fwd = delta(facing);
    const right = delta(turnRight(facing));
    let hits = 0;
    for (const lat of [-1, 0, 1]) {
      const cell = { x: pos.x + fwd.x + right.x * lat, y: pos.y + fwd.y + right.y * lat };
      const m = this.monsterAt(cell.x, cell.y);
      if (!m) continue;
      const roll = resolveAttack(this.rng, attackBonus(c), m.species.ac);
      if (roll.hit) {
        const dmg = rollDamage(this.rng, def.damage ?? [2, 4], statMod(c.stats.int));
        this.msg('combat', `The flames engulf the ${m.species.name} for ${dmg}.`);
        this.hitMonster(m, dmg);
        hits++;
      } else {
        this.msg('combat', `The ${m.species.name} dodges the flames.`);
      }
    }
    if (hits === 0 && !this.monsterAt(pos.x + fwd.x, pos.y + fwd.y)) {
      this.msg('ambient', 'The flames roar through empty air.');
    }
  }

  /** Heals the neediest living ally; declines (no cost) if no one is hurt. */
  private castHeal(def: SpellDef): boolean {
    if (!this.roster) return false;
    const wounded = this.roster.members
      .map((m, i) => ({ m, i }))
      .filter(({ m }) => !m.conditions.has('dead') && m.hp.cur < m.hp.max);
    if (wounded.length === 0) {
      this.msg('system', 'No one needs healing.');
      return false;
    }
    wounded.sort((a, b) => a.m.hp.cur / a.m.hp.max - b.m.hp.cur / b.m.hp.max);
    const target = wounded[0]!;
    const amount = rollDamage(this.rng, def.healDice ?? [2, 6], statMod(target.m.stats.wis));
    const healed = this.roster.heal(target.i, amount, this.bus);
    this.msg('loot', `${target.m.name} recovers ${healed} HP.`);
    return true;
  }

  /** Reveals nearby secret doors/illusions within a radius (plan §6.3). */
  private castDetect(def: SpellDef): void {
    const { pos } = this.party.getPose();
    const r = def.detectRadius ?? 3;
    let found = 0;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) + Math.abs(dy) > r) continue;
        const x = pos.x + dx;
        const y = pos.y + dy;
        for (const dir of [0, 1, 2, 3] as Dir[]) {
          const e = edgeAt(this.level, x, y, dir);
          if (!e || e.detected) continue;
          if (e.kind === 'illusion' || (e.kind === 'door' && e.door?.secret)) {
            e.detected = true;
            found++;
          }
        }
      }
    }
    this.msg(
      'ambient',
      found > 0 ? `You sense ${found} hidden passage${found > 1 ? 's' : ''} nearby!` : 'You sense nothing hidden nearby.',
    );
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

  /** Scoop up whatever is lying on the party's current cell (click-to-grab,
   * M8). Items that don't fit are left on the floor. */
  takeFloorItems(): void {
    if (!this.roster) return;
    const pos = this.party.getPose().pos;
    const cell = cellAt(this.level, pos.x, pos.y);
    if (!cell?.items || cell.items.length === 0) return;
    const remaining: Item[] = [];
    for (const it of cell.items) {
      if (this.roster.stow(it)) {
        this.bus.emit({ type: 'item/taken', name: it.tpl.name });
        this.msg('loot', `You pick up the ${it.tpl.name}.`);
      } else {
        remaining.push(it);
      }
    }
    cell.items = remaining;
    if (remaining.length > 0) this.msg('system', 'Your packs are full.');
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
      // Fall to the level below (plan M9). Arrival triggers are NOT processed
      // (you're placed, not stepping in), which also avoids stair loops.
      if (t.link) this.changeLevel(t.link.level, t.link.pos, t.link.facing);
      return;
    }
    if (t.kind === 'stairs' && t.link) {
      this.changeLevel(t.link.level, t.link.pos, t.link.facing);
      return;
    }
    if (t.kind === 'altar') this.reviveAtAltar();

    if (t.onEnter) {
      this.run(t.onEnter);
      // A teleport action may have moved us; process the new cell too.
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

  // --- Camping (plan §6.4/M9) ------------------------------------------------

  /**
   * Make camp: rest to recover HP/MP, consuming rations. Can't rest with a
   * monster hunting you, and there's a chance a wanderer interrupts the rest.
   * Without food the party rests hungrily, and eventually starves.
   */
  camp(): void {
    if (!this.roster) return;
    if (this.monsters.some((m) => m.state === 'hunt' || m.state === 'attack')) {
      this.msg('system', 'It is too dangerous to make camp.');
      return;
    }
    if (this.rng.next() < WANDER_CHANCE) {
      this.spawnWanderer();
      this.msg('damage', 'Your rest is interrupted — something creeps out of the dark!');
      return;
    }
    const fed = this.consumeFood();
    const frac = fed ? 0.6 : 0.2;
    for (let i = 0; i < this.roster.members.length; i++) {
      const c = this.roster.members[i]!;
      if (c.conditions.has('dead')) continue;
      if (!fed && this.hunger >= STARVE_AT) {
        this.roster.damage(i, 2, this.bus); // starving
      } else {
        this.roster.heal(i, Math.max(1, Math.round(c.hp.max * frac)), this.bus);
        c.mp.cur = c.mp.max;
        c.conditions.delete('poisoned');
      }
    }
    this.hunger = fed ? 0 : this.hunger + 1;
    this.bus.emit({ type: 'party/camped' });
    this.msg('loot', fed ? 'The party eats, rests, and recovers.' : 'You rest fitfully, hungry.');
  }

  /** A resurrection altar (plan M10): raise the fallen to half health. */
  private reviveAtAltar(): void {
    if (!this.roster) return;
    let revived = 0;
    for (let i = 0; i < this.roster.members.length; i++) {
      const c = this.roster.members[i]!;
      if (c.hp.cur > 0 && !c.conditions.has('unconscious') && !c.conditions.has('dead')) continue;
      c.conditions.delete('dead');
      c.hp.cur = 0; // give heal() room to work and to fire "stirs awake"
      this.roster.heal(i, Math.max(1, Math.floor(c.hp.max / 2)), this.bus);
      revived++;
    }
    this.msg(
      'loot',
      revived > 0
        ? `The altar's light knits bone and breath — ${revived} rise again.`
        : 'The altar glows softly, but none here need its blessing.',
    );
  }

  private consumeFood(): boolean {
    for (const c of this.roster!.members) {
      const idx = c.backpack.findIndex((it) => it?.tpl.food);
      if (idx < 0) continue;
      const it = c.backpack[idx]!;
      if ((it.count ?? 1) > 1) it.count = (it.count ?? 1) - 1;
      else c.backpack[idx] = null;
      return true;
    }
    return false;
  }

  private spawnWanderer(): void {
    const pool = this.level.spawns.map((s) => s.species);
    if (pool.length === 0) return;
    const sp = pool[this.rng.int(0, pool.length - 1)]!;
    const spot = this.findSpawnSpot();
    if (!spot) return;
    this.monsters.push(spawnMonster({ pos: spot, facing: 0, species: sp }));
  }

  private findSpawnSpot(): Vec2 | null {
    const p = this.party.getPose().pos;
    const candidates: Vec2[] = [];
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const d = Math.abs(dx) + Math.abs(dy);
        if (d < 2 || d > 4) continue;
        const x = p.x + dx;
        const y = p.y + dy;
        if (!isWalkable(this.level, x, y)) continue;
        if (this.monsterAt(x, y)) continue;
        candidates.push({ x, y });
      }
    }
    if (candidates.length === 0) return null;
    return candidates[this.rng.int(0, candidates.length - 1)]!;
  }

  // --- Save / load snapshot (plan §7/M9) ------------------------------------

  /** A serializable snapshot of all mutable world state. Items/species are
   * referenced by registry id so the blob stays small; the save layer
   * rehydrates them. */
  snapshot(): WorldSnapshot {
    return {
      current: this.current,
      party: { x: this.party.getPose().pos.x, y: this.party.getPose().pos.y, facing: this.party.getPose().facing },
      litMsLeft: this.litMsLeft,
      hunger: this.hunger,
      levels: this.levels.map((level, i) => this.snapshotLevel(level, this.monstersByLevel[i]!)),
    };
  }

  private snapshotLevel(level: Level, monsters: Monster[]): LevelSnapshot {
    const items: Record<string, ItemRef[]> = {};
    for (let y = 0; y < level.height; y++) {
      for (let x = 0; x < level.width; x++) {
        const cell = level.cells[y * level.width + x];
        if (cell?.items && cell.items.length > 0) items[`${x},${y}`] = cell.items.map(toItemRef);
      }
    }
    const edges: Record<string, EdgeSnapshot> = {};
    for (const [key, e] of level.edges) {
      const snap: EdgeSnapshot = {};
      if (e.door) {
        snap.doorOpen = e.door.open;
        snap.doorProgress = e.door.progress;
      }
      if (e.interact) {
        snap.used = e.interact.used ?? false;
        snap.on = e.interact.on ?? false;
      }
      if (e.detected) snap.detected = true;
      if (e.alcove) snap.alcove = e.alcove.map(toItemRef);
      edges[key] = snap;
    }
    return {
      items,
      edges,
      monsters: monsters
        .filter((m) => m.state !== 'dead')
        .map((m) => ({
          species: m.species.id,
          x: m.pos.x,
          y: m.pos.y,
          facing: m.facing,
          hpCur: m.hp.cur,
          state: m.state,
          moveTimer: m.moveTimer,
          attackTimer: m.attackTimer,
        })),
    };
  }

  /** Restore mutable world state from a snapshot, using the supplied
   * rehydration helpers (which own the registries; keeps World data-free). */
  applySnapshot(snap: WorldSnapshot, deps: SnapshotDeps): void {
    this.current = Math.max(0, Math.min(snap.current, this.levels.length - 1));
    this.litMsLeft = snap.litMsLeft;
    this.hunger = snap.hunger;

    snap.levels.forEach((ls, i) => {
      const level = this.levels[i];
      if (!level) return;
      for (const cell of level.cells) delete cell.items;
      for (const [key, refs] of Object.entries(ls.items)) {
        const [xs, ys] = key.split(',');
        const cell = level.cells[Number(ys) * level.width + Number(xs)];
        if (cell) cell.items = refs.map(deps.item);
      }
      for (const [key, es] of Object.entries(ls.edges)) {
        const e = level.edges.get(key);
        if (!e) continue;
        if (e.door && es.doorOpen !== undefined) {
          e.door.open = es.doorOpen;
          e.door.progress = es.doorProgress ?? (es.doorOpen ? 1 : 0);
          e.blocksMovement = !es.doorOpen;
        }
        if (e.interact) {
          e.interact.used = es.used ?? false;
          e.interact.on = es.on ?? false;
        }
        e.detected = es.detected ?? false;
        if (es.alcove) e.alcove = es.alcove.map(deps.item);
      }
      this.monstersByLevel[i] = ls.monsters.map((ms) => {
        const m = spawnMonster({ pos: { x: ms.x, y: ms.y }, facing: ms.facing, species: deps.species(ms.species) });
        m.hp.cur = ms.hpCur;
        m.state = ms.state;
        m.moveTimer = ms.moveTimer;
        m.attackTimer = ms.attackTimer;
        return m;
      });
    });

    this.projectiles.length = 0;
    this.party.enter(this.levels[this.current]!, { x: snap.party.x, y: snap.party.y }, snap.party.facing);
  }

  private msg(channel: LogChannel, text: string): void {
    this.bus.emit({ type: 'log/message', channel, text });
  }
}

const WANDER_CHANCE = 0.15;
const STARVE_AT = 3;

function toItemRef(it: Item): ItemRef {
  return {
    id: it.tpl.id,
    ...(it.count !== undefined ? { count: it.count } : {}),
    ...(it.charges !== undefined ? { charges: it.charges } : {}),
  };
}

/** Cardinal direction from `from` toward `to` (dominant axis). */
function faceToward(from: Vec2, to: Vec2): Dir {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 1 : 3;
  return dy >= 0 ? 2 : 0;
}

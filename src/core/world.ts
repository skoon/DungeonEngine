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
import { applyLevelUps } from './leveling';
import { isWeapon, type Item } from './item';
import type { SpellDef } from './spell';
import type { EventBus, LogChannel, TownService } from './events';
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
  /** Boss phase progress (plan M13); absent for ordinary monsters. */
  speedMult?: number;
  phasesFired?: number;
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
  recall?: { level: number; x: number; y: number; facing: Dir } | null;
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
  private wanderTimerMs = 0;
  private hunger = 0;
  /** Where the Town Portal spell leads. Injected from data (main.ts) so core
   * stays free of map content (plan M-DR3). */
  private town: { level: number; pos: Vec2; facing: Dir } | null = null;
  /** Where a cast Town Portal will return the party, until they step through
   * the town's return portal. Persisted in the save (plan M-DR3). */
  private recall: { level: number; pos: Vec2; facing: Dir } | null = null;

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

  /** Point the Town Portal spell at a level + arrival pose (plan M-DR3). Called
   * once at boot from data, keeping the town's location out of core. */
  setTown(level: number, pos: Vec2, facing: Dir): void {
    this.town = { level, pos: { ...pos }, facing };
  }

  /** True while a monster is actively hunting or attacking — no camping or
   * town-portalling out of a live fight (plan §6.4 / M-DR3). */
  private inDanger(): boolean {
    return this.monsters.some((m) => m.state === 'hunt' || m.state === 'attack');
  }

  /** Move the party to another level (stairs/pit). Autosave hook fires via
   * the emitted event. In-flight projectiles do not follow. */
  changeLevel(index: number, pos: Vec2, facing?: Dir): void {
    if (index < 0 || index >= this.levels.length) return;
    this.current = index;
    this.projectiles.length = 0;
    this.wanderTimerMs = 0;
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
      this.roster.bleed(dtMs, this.bus); // dying members bleed toward −10 (plan §6.4)
      this.roster.tickPoison(dtMs, this.bus); // venom chips HP over time (plan M13)
      this.roster.tickFlash(dtMs);
    }
    this.litMsLeft = Math.max(0, this.litMsLeft - dtMs);
    this.tickWanderers(dtMs);
    this.updateMonsters(dtMs);
    this.tickProjectiles(dtMs);
    this.pruneDead();
  }

  /** Grind loop (plan M12): on a level flagged for wandering, trickle in fresh
   * monsters from its spawn pool — capped, so it stays a controlled farm and
   * never piles onto a party already fighting. */
  private tickWanderers(dtMs: number): void {
    const cfg = this.level.wander;
    if (!cfg || !this.roster) return;
    if (this.monsters.length >= cfg.maxAlive) {
      this.wanderTimerMs = 0;
      return;
    }
    this.wanderTimerMs += dtMs;
    if (this.wanderTimerMs < cfg.everyMs) return;
    this.wanderTimerMs = 0;
    this.spawnWanderer();
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

  /** Roll a monster's on-hit poison against a member it just wounded (plan M13). */
  private maybePoison(m: Monster, idx: number, c: Character): void {
    if (!this.roster || !m.species.poison) return;
    if (isDisabled(c)) return; // no venom in a corpse
    if (this.rng.next() < m.species.poison) {
      this.roster.applyPoison(idx);
      this.msg('damage', `Venom courses through ${c.name}!`);
    }
  }

  /** Apply damage to a monster (shared by melee, projectiles, and spells). */
  private hitMonster(m: Monster, dmg: number): void {
    m.flash = MONSTER_FLASH_MS;
    m.hp.cur -= dmg;
    if (m.hp.cur <= 0) {
      this.killMonster(m);
    } else {
      this.checkPhases(m);
    }
  }

  /** Fire any boss phases whose HP threshold this hit just crossed (plan M13):
   * summon reinforcements and/or enrage. Phases fire in declared order, once. */
  private checkPhases(m: Monster): void {
    const phases = m.species.phases;
    if (!phases) return;
    while (m.phasesFired < phases.length) {
      const phase = phases[m.phasesFired]!;
      if (m.hp.cur > m.species.maxHp * phase.atHpFrac) break;
      m.phasesFired += 1;
      if (phase.speedMult && phase.speedMult > 0) {
        m.speedMult *= phase.speedMult;
        this.msg('damage', `The ${m.species.name} howls and quickens!`);
      }
      if (phase.summon) this.summonMonsters(m, phase.summon.species, phase.summon.count);
    }
  }

  /** Place `count` fresh monsters near the party (safe placement via
   * findSpawnSpot), as a boss summon (plan M13). */
  private summonMonsters(source: Monster, species: MonsterSpecies, count: number): void {
    const partyPos = this.party.getPose().pos;
    let summoned = 0;
    for (let i = 0; i < count; i++) {
      const spot = this.findSpawnSpot();
      if (!spot) break;
      const mob = spawnMonster({ pos: spot, facing: faceToward(spot, partyPos), species });
      mob.state = 'hunt'; // arrives already stalking the party
      this.monsters.push(mob);
      summoned++;
    }
    if (summoned > 0) this.msg('damage', `The ${source.species.name} raises ${summoned} ${species.name}${summoned > 1 ? 's' : ''} from the dead!`);
  }

  private killMonster(m: Monster): void {
    m.state = 'dead';
    this.bus.emit({ type: 'monster/died', name: m.species.name, xp: m.species.xp });
    this.msg('loot', `The ${m.species.name} is destroyed! (+${m.species.xp} XP)`);
    this.grantXp(m.species.xp);
    this.grantGold(m.species.gold);
    const drops = m.species.loot?.() ?? [];
    if (drops.length > 0) {
      const cell = cellAt(this.level, m.pos.x, m.pos.y);
      if (cell) cell.items = [...(cell.items ?? []), ...drops];
    }
  }

  /** Award XP to every living member and apply any level-ups (plan M10). */
  private grantXp(amount: number): void {
    if (!this.roster) return;
    for (let i = 0; i < this.roster.members.length; i++) {
      const c = this.roster.members[i]!;
      if (isDisabled(c)) continue; // the fallen earn nothing this fight
      c.xp += amount;
      if (applyLevelUps(c, this.rng) > 0) {
        this.roster.healFlash[i] = 220; // celebratory flash + fresh HP
        this.bus.emit({ type: 'char/leveledUp', member: i, level: c.level });
        this.msg('loot', `${c.name} reaches level ${c.level}!`);
      }
    }
  }

  /** Roll and bank a monster's coin drop, announcing it (plan M-DR2). */
  private grantGold(range?: [number, number]): void {
    if (!this.roster || !range) return;
    const amount = this.rng.int(range[0], range[1]);
    if (amount <= 0) return;
    this.roster.earn(amount);
    this.bus.emit({ type: 'party/gold', amount, total: this.roster.gold });
    this.msg('loot', `You find ${amount} gold.`);
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
          m.attackTimer = m.species.attackMs * m.speedMult;
        }
      } else if (m.state === 'hunt' && m.species.ranged && m.attackTimer <= 0 && this.fireRanged(m, partyPos)) {
        m.attackTimer = m.species.attackMs * m.speedMult;
      } else if (m.moveTimer <= 0) {
        const dir =
          m.state === 'flee'
            ? stepAway(this.level, m.pos, partyPos, blocked)
            : stepToward(this.level, m.pos, partyPos, blocked, m.species.sight);
        if (dir !== null) {
          m.facing = dir;
          m.pos = translate(m.pos, dir);
        }
        m.moveTimer = m.species.moveMs * m.speedMult;
      }
    }
  }

  /** If the party sits on a clear cardinal line within range, loose a bolt at
   * them and return true; otherwise false (the monster then closes in). M13. */
  private fireRanged(m: Monster, partyPos: Vec2): boolean {
    const spec = m.species.ranged!;
    const dir = cardinalShot(m.pos, partyPos, spec.range, this.level, (x, y) =>
      this.monsters.some((o) => o !== m && o.state !== 'dead' && o.pos.x === x && o.pos.y === y),
    );
    if (dir === null) return false;
    m.facing = dir;
    this.projectiles.push(
      spawnProjectile({
        pos: translate(m.pos, dir),
        dir,
        from: 'monster',
        attackBonus: m.species.attackBonus,
        damage: spec.damage,
        damageBonus: 0,
        glyph: spec.glyph ?? '*',
        color: spec.color ?? m.species.color,
        label: spec.label ?? `${m.species.name}'s bolt`,
        ...(spec.hopMs !== undefined ? { hopMs: spec.hopMs } : {}),
        range: spec.range,
      }),
    );
    this.msg('combat', `The ${m.species.name} looses a ${spec.label ?? 'bolt'}!`);
    return true;
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
      this.maybePoison(m, idx, c);
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
      case 'townPortal':
        ok = this.castTownPortal();
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

  /** Open a Town Portal (plan M-DR3): remember the current pose as the recall
   * anchor and whisk the party to town. Refused mid-fight or if already there.
   * Returns false (no mana spent) when it can't be cast. */
  private castTownPortal(): boolean {
    if (!this.town) {
      this.msg('system', 'The way to town is closed to you.');
      return false;
    }
    if (this.current === this.town.level) {
      this.msg('system', 'You are already in town.');
      return false;
    }
    if (this.inDanger()) {
      this.msg('system', 'You cannot open a portal while enemies press the attack.');
      return false;
    }
    const { pos, facing } = this.party.getPose();
    this.recall = { level: this.current, pos: { ...pos }, facing };
    this.changeLevel(this.town.level, this.town.pos, this.town.facing);
    return true;
  }

  /** Step back through the town's return portal to where Town Portal was cast
   * (plan M-DR3). The anchor is one-shot: consumed on return. */
  returnFromTown(): void {
    if (!this.recall) {
      this.msg('system', 'The portal shimmers and fades — there is nowhere to return to.');
      return;
    }
    const r = this.recall;
    this.recall = null;
    this.changeLevel(r.level, r.pos, r.facing);
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
    if (t.kind === 'townhub' && t.service) this.enterTownService(t.service);
    if (t.kind === 'victory' && t.requires && this.partyCarries(t.requires)) {
      this.msg('loot', 'The seal drinks the amulet’s light — the gates swing wide!');
      this.bus.emit({ type: 'game/won' });
      return;
    }

    if (t.onEnter) {
      this.run(t.onEnter);
      // A teleport action may have moved us; process the new cell too.
      const after = this.party.getPose().pos;
      if (after.x !== pos.x || after.y !== pos.y) {
        this.enterCell({ ...after }, hops + 1);
      }
    }
  }

  /** Whether any living member carries an item with template id `id` in
   * hands or backpack (plan M14 — the victory shrine's quest check). */
  private partyCarries(id: string): boolean {
    if (!this.roster) return false;
    return this.roster.members.some(
      (c) =>
        !c.conditions.has('dead') &&
        [...c.hands, ...c.backpack].some((it) => it?.tpl.id === id),
    );
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
    if (this.inDanger()) {
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

  // --- Town Hub services (plan M-DR4) ---------------------------------------

  /** Handle stepping onto a town service cell. Rest and return happen in core;
   * raise/recruit only announce themselves — the UI opens an overlay and then
   * calls back into {@link raiseDead} / {@link replaceMember}. */
  private enterTownService(service: TownService): void {
    this.bus.emit({ type: 'town/service', service });
    if (service === 'rest') this.restInTown();
    else if (service === 'return') this.returnFromTown();
  }

  /** Fully restore the living party (HP/MP, poison, hunger, stabilises the
   * dying) at the town's rest point. The dead are untouched — they must be
   * raised first. */
  restInTown(): void {
    if (!this.roster) return;
    for (const c of this.roster.members) {
      if (c.conditions.has('dead')) continue;
      c.hp.cur = c.hp.max;
      c.mp.cur = c.mp.max;
      c.conditions.delete('poisoned');
      c.conditions.delete('unconscious');
    }
    this.hunger = 0;
    this.msg('loot', 'The party rests in the safety of town, fully restored.');
  }

  /** Raise a dead member for gold scaled by their level, returning them at half
   * health with identity, gear, and XP intact. False (nothing spent) if they
   * are not dead or the party cannot afford it. */
  raiseDead(index: number): boolean {
    if (!this.roster) return false;
    const c = this.roster.member(index);
    if (!c || !c.conditions.has('dead')) {
      this.msg('system', 'There is no one to raise there.');
      return false;
    }
    const cost = RAISE_COST_PER_LEVEL * c.level;
    if (!this.roster.spend(cost)) {
      this.msg('system', `Raising ${c.name} costs ${cost} gold — the purse is too light.`);
      return false;
    }
    c.conditions.delete('dead');
    c.hp.cur = 0; // give heal() room to work
    this.roster.heal(index, Math.max(1, Math.floor(c.hp.max / 2)), this.bus);
    this.bus.emit({ type: 'char/raised', member: index });
    this.msg('loot', `The shrine's light returns ${c.name} to life for ${cost} gold.`);
    return true;
  }

  /** Replace a member (typically a dead one) with a freshly-recruited
   * adventurer, dropping the outgoing member's gear on the town floor so it
   * isn't lost. Costs {@link RECRUIT_COST} gold. */
  replaceMember(index: number, replacement: Character): boolean {
    if (!this.roster) return false;
    const old = this.roster.member(index);
    if (!old) return false;
    if (!this.roster.spend(RECRUIT_COST)) {
      this.msg('system', `Recruiting costs ${RECRUIT_COST} gold — the purse is too light.`);
      return false;
    }
    this.dropMemberGear(old);
    this.roster.install(index, replacement);
    this.bus.emit({ type: 'char/replaced', member: index });
    this.msg('loot', `${replacement.name} joins the party in ${old.name}'s stead.`);
    return true;
  }

  /** Tip a departing member's carried gear onto the party's current cell. */
  private dropMemberGear(c: Character): void {
    const items: Item[] = [];
    for (const h of c.hands) if (h) items.push(h);
    for (const it of Object.values(c.equipment)) if (it) items.push(it);
    for (const it of c.backpack) if (it) items.push(it);
    if (items.length === 0) return;
    const pos = this.party.getPose().pos;
    const cell = cellAt(this.level, pos.x, pos.y);
    if (cell) cell.items = [...(cell.items ?? []), ...items];
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
      recall: this.recall
        ? { level: this.recall.level, x: this.recall.pos.x, y: this.recall.pos.y, facing: this.recall.facing }
        : null,
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
          ...(m.speedMult !== 1 ? { speedMult: m.speedMult } : {}),
          ...(m.phasesFired !== 0 ? { phasesFired: m.phasesFired } : {}),
        })),
    };
  }

  /** Restore mutable world state from a snapshot, using the supplied
   * rehydration helpers (which own the registries; keeps World data-free). */
  applySnapshot(snap: WorldSnapshot, deps: SnapshotDeps): void {
    this.current = Math.max(0, Math.min(snap.current, this.levels.length - 1));
    this.litMsLeft = snap.litMsLeft;
    this.hunger = snap.hunger;
    this.recall = snap.recall
      ? { level: snap.recall.level, pos: { x: snap.recall.x, y: snap.recall.y }, facing: snap.recall.facing }
      : null;

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
        m.speedMult = ms.speedMult ?? 1;
        m.phasesFired = ms.phasesFired ?? 0;
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
/** Gold to raise the dead, per level of the fallen (plan M-DR4). */
export const RAISE_COST_PER_LEVEL = 100;
/** Gold to recruit a replacement adventurer. */
export const RECRUIT_COST = 50;

/** Gold to raise a specific fallen character (level-scaled). */
export function raiseCost(level: number): number {
  return RAISE_COST_PER_LEVEL * level;
}

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

/**
 * If `to` lies on a clear cardinal line from `from` within `range`, return the
 * firing direction; else null. "Clear" = no wall/door edge between cells and no
 * blocking monster on an intermediate cell (the target cell itself may hold the
 * party). Used for monster ranged attacks (plan M13).
 */
function cardinalShot(
  from: Vec2,
  to: Vec2,
  range: number,
  level: Level,
  blocked: (x: number, y: number) => boolean,
): Dir | null {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if ((dx !== 0 && dy !== 0) || (dx === 0 && dy === 0)) return null; // not on a line
  const dist = Math.abs(dx) + Math.abs(dy);
  if (dist > range) return null;
  const dir: Dir = dx !== 0 ? (dx > 0 ? 1 : 3) : dy > 0 ? 2 : 0;
  let cur: Vec2 = from;
  for (let step = 0; step < dist; step++) {
    if (!canEnter(level, cur, dir)) return null; // wall/closed door in the way
    cur = translate(cur, dir);
    if (step < dist - 1 && blocked(cur.x, cur.y)) return null; // ally between us
  }
  return dir;
}

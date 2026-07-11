/**
 * The four-character party roster and its 2x2 formation (plan §2.2/§3.3).
 * Members 0,1 are the front rank; 2,3 the back rank. Reordering members
 * swaps their formation position.
 */

import { type Character, firstFreePack, isDisabled } from './character';
import type { Item } from './item';
import type { EventBus } from './events';

const FLASH_MS = 220;

/** HP at or below which a dying (unconscious) member becomes permanently dead
 * (plan §6.4 / DEATH_AND_REVIVAL §1). */
const DYING_FLOOR = -10;
/** How much real time buys one point of bleed-out while unconscious. */
const BLEED_INTERVAL_MS = 1000;
/** Real time per point of poison damage (plan M13). */
const POISON_INTERVAL_MS = 2000;
/** How many points a fresh dose of poison deals before it wears off. */
const POISON_DOSE = 6;

export class Roster {
  /** Per-member hurt-flash timer (ms), for the party-panel damage flash. */
  readonly hurt: number[];
  /** Per-member heal-flash timer (ms), for the party-panel green flash. */
  readonly healFlash: number[];
  /** Per-member accumulated time toward the next bleed-out point (ms). */
  private readonly bleedAccum: number[];
  /** Per-member accumulated time toward the next poison tick (ms). */
  private readonly poisonAccum: number[];
  /** Per-member poison points remaining before the venom wears off. */
  private readonly poisonLeft: number[];
  /** Party-shared coin purse, spent on town services (plan M-DR2). */
  gold = 0;

  constructor(public readonly members: Character[]) {
    this.hurt = members.map(() => 0);
    this.healFlash = members.map(() => 0);
    this.bleedAccum = members.map(() => 0);
    this.poisonAccum = members.map(() => 0);
    this.poisonLeft = members.map(() => 0);
  }

  /** Add coin to the shared purse. */
  earn(amount: number): void {
    if (amount > 0) this.gold += amount;
  }

  /** Deduct `cost` from the purse if affordable; false (unchanged) if not. */
  spend(cost: number): boolean {
    if (cost < 0 || this.gold < cost) return false;
    this.gold -= cost;
    return true;
  }

  member(i: number): Character | undefined {
    return this.members[i];
  }

  /** Advance hurt/heal-flash timers. */
  tickFlash(dtMs: number): void {
    for (let i = 0; i < this.hurt.length; i++) {
      this.hurt[i] = Math.max(0, (this.hurt[i] ?? 0) - dtMs);
      this.healFlash[i] = Math.max(0, (this.healFlash[i] ?? 0) - dtMs);
    }
  }

  everyoneDown(): boolean {
    return this.members.every((c) => isDisabled(c));
  }

  frontRank(): Character[] {
    return this.members.slice(0, 2);
  }

  backRank(): Character[] {
    return this.members.slice(2, 4);
  }

  swap(i: number, j: number): void {
    const m = this.members;
    if (i < 0 || j < 0 || i >= m.length || j >= m.length) return;
    swapAt(m, i, j);
    swapAt(this.hurt, i, j); // keep transient flashes with their character
    swapAt(this.healFlash, i, j);
    swapAt(this.bleedAccum, i, j);
  }

  /** Overwrite a roster slot with a fresh character, clearing that slot's
   * transient timers (hurt/heal flashes, bleed accumulation). Used when a
   * replacement adventurer is recruited in town (plan M-DR4). */
  install(index: number, c: Character): void {
    if (index < 0 || index >= this.members.length) return;
    this.members[index] = c;
    this.hurt[index] = 0;
    this.healFlash[index] = 0;
    this.bleedAccum[index] = 0;
    this.poisonAccum[index] = 0;
    this.poisonLeft[index] = 0;
  }

  /** First member with a free backpack slot, or -1. */
  memberWithSpace(): number {
    return this.members.findIndex((c) => firstFreePack(c) >= 0);
  }

  /** Stow an item in the first available backpack slot; false if full. */
  stow(item: Item): boolean {
    const idx = this.memberWithSpace();
    if (idx < 0) return false;
    const c = this.members[idx]!;
    c.backpack[firstFreePack(c)] = item;
    return true;
  }

  /**
   * Apply damage to one member. A healthy member's first fall to 0 HP is
   * clamped there and flagged unconscious (emitting `char/down`); once down,
   * further damage drives HP negative toward the −10 dying floor, at which
   * point the member dies permanently (plan §6.4 / DEATH_AND_REVIVAL §1).
   * The dead take no further damage.
   */
  damage(index: number, amount: number, bus: EventBus): void {
    const c = this.members[index];
    if (!c || c.conditions.has('dead')) return;
    const wasDown = isDisabled(c);
    // Clamp the first collapse at 0; only an already-down member bleeds past it.
    c.hp.cur = wasDown ? c.hp.cur - amount : Math.max(0, c.hp.cur - amount);
    this.hurt[index] = FLASH_MS;
    bus.emit({ type: 'char/damaged', member: index, amount, hpCur: c.hp.cur });
    if (c.hp.cur <= 0 && !wasDown) {
      c.conditions.add('unconscious');
      bus.emit({ type: 'char/down', member: index });
      bus.emit({ type: 'log/message', channel: 'damage', text: `${c.name} collapses!` });
    }
    this.checkDeath(index, bus);
  }

  /**
   * Advance bleed-out for every unconscious member (plan §6.4). Each accrues
   * real time and loses 1 HP per {@link BLEED_INTERVAL_MS}; reaching the dying
   * floor kills them. Called from World.tick with the sim-tick delta. Bleeding
   * is silent (no hurt flash / damage event) — only death is announced.
   */
  bleed(dtMs: number, bus: EventBus): void {
    for (let i = 0; i < this.members.length; i++) {
      const c = this.members[i]!;
      if (c.conditions.has('dead') || !c.conditions.has('unconscious')) {
        this.bleedAccum[i] = 0;
        continue;
      }
      this.bleedAccum[i] = (this.bleedAccum[i] ?? 0) + dtMs;
      while (this.bleedAccum[i]! >= BLEED_INTERVAL_MS && c.conditions.has('unconscious')) {
        this.bleedAccum[i]! -= BLEED_INTERVAL_MS;
        c.hp.cur -= 1;
        this.checkDeath(i, bus);
      }
    }
  }

  /** Envenom a member: a fresh dose of poison that will chip HP over time
   * until it wears off or is cured (plan M13). Re-application refreshes it.
   * The dead and already-fallen can't be newly poisoned. */
  applyPoison(index: number): void {
    const c = this.members[index];
    if (!c || isDisabled(c)) return;
    c.conditions.add('poisoned');
    this.poisonLeft[index] = POISON_DOSE;
    this.poisonAccum[index] = 0;
  }

  /**
   * Advance poison for every envenomed, conscious member (plan M13): 1 HP per
   * {@link POISON_INTERVAL_MS} until the dose runs out, then the condition
   * clears. Paused while a member is unconscious (bleed-out takes over) and
   * fully cleared by Cure Wounds / camp elsewhere. Called from World.tick.
   */
  tickPoison(dtMs: number, bus: EventBus): void {
    for (let i = 0; i < this.members.length; i++) {
      const c = this.members[i]!;
      if (!c.conditions.has('poisoned')) {
        this.poisonAccum[i] = 0;
        this.poisonLeft[i] = 0;
        continue;
      }
      if (isDisabled(c)) continue; // paused while down/dead
      if (this.poisonLeft[i]! <= 0) {
        c.conditions.delete('poisoned');
        this.poisonAccum[i] = 0;
        continue;
      }
      this.poisonAccum[i] = (this.poisonAccum[i] ?? 0) + dtMs;
      while (this.poisonAccum[i]! >= POISON_INTERVAL_MS && this.poisonLeft[i]! > 0 && !isDisabled(c)) {
        this.poisonAccum[i]! -= POISON_INTERVAL_MS;
        this.poisonLeft[i]! -= 1;
        this.damage(i, 1, bus); // routes collapse/death through the one code path
      }
      if (this.poisonLeft[i]! <= 0) c.conditions.delete('poisoned');
    }
  }

  /** Promote a member past the dying floor to permanent death. */
  private checkDeath(index: number, bus: EventBus): void {
    const c = this.members[index];
    if (!c || c.conditions.has('dead')) return;
    if (c.hp.cur <= DYING_FLOOR) {
      c.conditions.delete('unconscious');
      c.conditions.add('dead');
      this.bleedAccum[index] = 0;
      bus.emit({ type: 'char/died', member: index });
      bus.emit({ type: 'log/message', channel: 'damage', text: `${c.name} has died.` });
    }
  }

  /** Restore HP, capped at max. Returns the actual amount healed (0 if
   * already at full). Revives an unconscious member who rises above 0 HP. */
  heal(index: number, amount: number, bus: EventBus): number {
    const c = this.members[index];
    if (!c) return 0;
    const before = c.hp.cur;
    c.hp.cur = Math.min(c.hp.max, c.hp.cur + amount);
    const actual = c.hp.cur - before;
    if (actual <= 0) return 0;
    this.healFlash[index] = FLASH_MS;
    bus.emit({ type: 'char/healed', member: index, amount: actual, hpCur: c.hp.cur });
    if (c.conditions.has('unconscious') && c.hp.cur > 0) {
      c.conditions.delete('unconscious');
      bus.emit({ type: 'log/message', channel: 'system', text: `${c.name} stirs awake!` });
    }
    return actual;
  }
}

function swapAt<T>(arr: T[], i: number, j: number): void {
  const tmp = arr[i]!;
  arr[i] = arr[j]!;
  arr[j] = tmp;
}

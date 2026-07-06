/**
 * The four-character party roster and its 2x2 formation (plan §2.2/§3.3).
 * Members 0,1 are the front rank; 2,3 the back rank. Reordering members
 * swaps their formation position.
 */

import { type Character, firstFreePack, isDisabled } from './character';
import type { Item } from './item';
import type { EventBus } from './events';

const FLASH_MS = 220;

export class Roster {
  /** Per-member hurt-flash timer (ms), for the party-panel damage flash. */
  readonly hurt: number[];

  constructor(public readonly members: Character[]) {
    this.hurt = members.map(() => 0);
  }

  member(i: number): Character | undefined {
    return this.members[i];
  }

  /** Advance hurt-flash timers. */
  tickFlash(dtMs: number): void {
    for (let i = 0; i < this.hurt.length; i++) {
      this.hurt[i] = Math.max(0, (this.hurt[i] ?? 0) - dtMs);
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
    const tmp = m[i]!;
    m[i] = m[j]!;
    m[j] = tmp;
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

  /** Apply damage to one member, flagging unconsciousness at 0 HP. */
  damage(index: number, amount: number, bus: EventBus): void {
    const c = this.members[index];
    if (!c) return;
    const wasDown = isDisabled(c);
    c.hp.cur = Math.max(0, c.hp.cur - amount);
    this.hurt[index] = FLASH_MS;
    bus.emit({ type: 'char/damaged', member: index, amount, hpCur: c.hp.cur });
    if (c.hp.cur <= 0 && !wasDown) {
      c.conditions.add('unconscious');
      bus.emit({ type: 'char/down', member: index });
      bus.emit({ type: 'log/message', channel: 'damage', text: `${c.name} collapses!` });
    }
  }
}

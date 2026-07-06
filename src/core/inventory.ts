/**
 * Inventory item-move logic (pure). The overlay UI works like the classic
 * crawler: you grab an item onto the cursor, then place it elsewhere. This
 * module resolves slot references and performs pick-up / place so the rules
 * (equip-slot matching, swapping) are testable without any UI.
 */

import type { EquipSlot } from './character';
import { type Item, fitsEquipSlot } from './item';
import type { Roster } from './roster';

export type { EquipSlot };

export type SlotRef =
  | { kind: 'hand'; member: number; index: 0 | 1 }
  | { kind: 'equip'; member: number; slot: EquipSlot }
  | { kind: 'pack'; member: number; index: number }
  | { kind: 'floor'; index: number };

export interface InvContext {
  roster: Roster;
  /** Loose items on the party's current cell (mutated in place). */
  floor: Item[];
}

export function itemAt(ctx: InvContext, ref: SlotRef): Item | null {
  switch (ref.kind) {
    case 'hand':
      return ctx.roster.member(ref.member)?.hands[ref.index] ?? null;
    case 'equip':
      return ctx.roster.member(ref.member)?.equipment[ref.slot] ?? null;
    case 'pack':
      return ctx.roster.member(ref.member)?.backpack[ref.index] ?? null;
    case 'floor':
      return ctx.floor[ref.index] ?? null;
  }
}

/** Remove and return the item at `ref`, or null if empty. */
export function pickUp(ctx: InvContext, ref: SlotRef): Item | null {
  const c = ref.kind !== 'floor' ? ctx.roster.member(ref.member) : undefined;
  switch (ref.kind) {
    case 'hand': {
      if (!c) return null;
      const it = c.hands[ref.index];
      c.hands[ref.index] = null;
      return it;
    }
    case 'equip': {
      if (!c) return null;
      const it = c.equipment[ref.slot] ?? null;
      c.equipment[ref.slot] = null;
      return it;
    }
    case 'pack': {
      if (!c) return null;
      const it = c.backpack[ref.index] ?? null;
      c.backpack[ref.index] = null;
      return it;
    }
    case 'floor': {
      const it = ctx.floor[ref.index] ?? null;
      if (it) ctx.floor.splice(ref.index, 1);
      return it;
    }
  }
}

/**
 * Place `item` at `ref`. Returns whatever was displaced (to keep on the
 * cursor), or the same item back if the slot rejects it, or null on a clean
 * placement. Floor placement always appends.
 */
export function placeInto(ctx: InvContext, ref: SlotRef, item: Item): Item | null {
  const c = ref.kind !== 'floor' ? ctx.roster.member(ref.member) : undefined;
  switch (ref.kind) {
    case 'equip': {
      if (!c || !fitsEquipSlot(ref.slot, item)) return item; // rejected
      const cur = c.equipment[ref.slot] ?? null;
      c.equipment[ref.slot] = item;
      return cur;
    }
    case 'hand': {
      if (!c) return item;
      const cur = c.hands[ref.index];
      c.hands[ref.index] = item;
      return cur;
    }
    case 'pack': {
      if (!c) return item;
      const cur = c.backpack[ref.index] ?? null;
      c.backpack[ref.index] = item;
      return cur;
    }
    case 'floor':
      ctx.floor.push(item);
      return null;
  }
}

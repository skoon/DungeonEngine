import { describe, expect, it, vi } from 'vitest';
import { EventBus } from '@/core/events';
import { Roster } from '@/core/roster';
import { defaultParty } from '@/data/party';

describe('Roster', () => {
  it('exposes front and back ranks by order', () => {
    const r = new Roster(defaultParty());
    expect(r.frontRank().map((c) => c.name)).toEqual(['Kestra', 'Bram']);
    expect(r.backRank().map((c) => c.name)).toEqual(['Sable', 'Pip']);
  });

  it('swap reorders formation positions', () => {
    const r = new Roster(defaultParty());
    r.swap(0, 2); // move Kestra to the back
    expect(r.member(0)?.name).toBe('Sable');
    expect(r.member(2)?.name).toBe('Kestra');
  });

  it('damage reduces HP and flags unconsciousness at zero', () => {
    const r = new Roster(defaultParty());
    const bus = new EventBus();
    const down = vi.fn();
    bus.on('char/down', down);
    const hp = r.member(0)!.hp.cur;
    r.damage(0, hp, bus);
    expect(r.member(0)!.hp.cur).toBe(0);
    expect(r.member(0)!.conditions.has('unconscious')).toBe(true);
    expect(down).toHaveBeenCalledOnce();
  });

  it('stow places an item in the first member with space', () => {
    const r = new Roster(defaultParty());
    expect(r.stow({ tpl: { id: 'x', name: 'X', glyph: 'x', color: '#fff', slot: 'misc', weight: 1 } })).toBe(true);
  });

  it('clamps the first collapse at 0 HP even on massive overkill', () => {
    const r = new Roster(defaultParty());
    const bus = new EventBus();
    r.damage(0, 999, bus);
    expect(r.member(0)!.hp.cur).toBe(0);
    expect(r.member(0)!.conditions.has('unconscious')).toBe(true);
    expect(r.member(0)!.conditions.has('dead')).toBe(false);
  });

  it('further damage drives a downed member past −10 into permanent death', () => {
    const r = new Roster(defaultParty());
    const bus = new EventBus();
    const died = vi.fn();
    bus.on('char/died', died);
    r.damage(0, r.member(0)!.hp.cur, bus); // to 0 -> unconscious
    r.damage(0, 10, bus); // 0 -> -10 -> dead
    expect(r.member(0)!.hp.cur).toBeLessThanOrEqual(-10);
    expect(r.member(0)!.conditions.has('dead')).toBe(true);
    expect(r.member(0)!.conditions.has('unconscious')).toBe(false);
    expect(died).toHaveBeenCalledOnce();
  });

  it('a dead member takes no further damage', () => {
    const r = new Roster(defaultParty());
    const bus = new EventBus();
    r.member(0)!.hp.cur = 0;
    r.member(0)!.conditions.add('dead');
    r.damage(0, 5, bus);
    expect(r.member(0)!.hp.cur).toBe(0);
  });

  it('bleed drains an untouched unconscious member until they die', () => {
    const r = new Roster(defaultParty());
    const bus = new EventBus();
    const died = vi.fn();
    bus.on('char/died', died);
    r.damage(0, r.member(0)!.hp.cur, bus); // to 0 -> unconscious
    // 11 seconds of bleeding at 1 HP/s takes 0 -> below −10.
    for (let t = 0; t < 11; t++) r.bleed(1000, bus);
    expect(r.member(0)!.conditions.has('dead')).toBe(true);
    expect(died).toHaveBeenCalledOnce();
  });

  it('bleed leaves a healed (revived) member alone', () => {
    const r = new Roster(defaultParty());
    const bus = new EventBus();
    r.damage(0, r.member(0)!.hp.cur, bus); // unconscious at 0
    r.bleed(1000, bus); // -1
    r.heal(0, 5, bus); // back above 0, wakes (existing path)
    const hp = r.member(0)!.hp.cur;
    for (let t = 0; t < 20; t++) r.bleed(1000, bus);
    expect(r.member(0)!.hp.cur).toBe(hp);
    expect(r.member(0)!.conditions.has('dead')).toBe(false);
  });

  it('heal never revives a dead member', () => {
    const r = new Roster(defaultParty());
    const bus = new EventBus();
    r.member(0)!.hp.cur = -10;
    r.member(0)!.conditions.add('dead');
    r.heal(0, 20, bus);
    expect(r.member(0)!.conditions.has('dead')).toBe(true);
  });
});

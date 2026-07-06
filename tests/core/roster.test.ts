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
});

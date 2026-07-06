import { describe, expect, it, vi } from 'vitest';
import { EventBus } from '@/core/events';

describe('EventBus', () => {
  it('delivers events to type-specific subscribers', () => {
    const bus = new EventBus();
    const handler = vi.fn();
    bus.on('sim/tick', handler);
    bus.emit({ type: 'sim/tick', tick: 1 });
    expect(handler).toHaveBeenCalledWith({ type: 'sim/tick', tick: 1 });
  });

  it('does not deliver events of other types', () => {
    const bus = new EventBus();
    const handler = vi.fn();
    bus.on('log/message', handler);
    bus.emit({ type: 'sim/tick', tick: 1 });
    expect(handler).not.toHaveBeenCalled();
  });

  it('onAny receives every event', () => {
    const bus = new EventBus();
    const handler = vi.fn();
    bus.onAny(handler);
    bus.emit({ type: 'sim/tick', tick: 1 });
    bus.emit({ type: 'log/message', channel: 'system', text: 'hi' });
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it('unsubscribe stops delivery', () => {
    const bus = new EventBus();
    const handler = vi.fn();
    const off = bus.on('sim/tick', handler);
    off();
    bus.emit({ type: 'sim/tick', tick: 1 });
    expect(handler).not.toHaveBeenCalled();
  });

  it('a handler unsubscribing itself during emit does not break dispatch', () => {
    const bus = new EventBus();
    const calls: string[] = [];
    const offA = bus.on('sim/tick', () => {
      calls.push('a');
      offA();
    });
    bus.on('sim/tick', () => calls.push('b'));
    bus.emit({ type: 'sim/tick', tick: 1 });
    bus.emit({ type: 'sim/tick', tick: 2 });
    expect(calls).toEqual(['a', 'b', 'b']);
  });
});

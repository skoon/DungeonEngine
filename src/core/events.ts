/**
 * Typed event bus. The simulation core emits events; presentation layers
 * (log panel, audio, viewport effects) subscribe. The core never formats
 * user-facing strings — subscribers own wording and presentation.
 *
 * The GameEvent union grows as systems come online (M1+: PartyMoved,
 * AttackResolved, DoorOpened, ...).
 */

import type { Dir } from './grid';

export type LogChannel = 'combat' | 'damage' | 'loot' | 'ambient' | 'system';

export type GameEvent =
  | { type: 'sim/tick'; tick: number }
  | { type: 'log/message'; channel: LogChannel; text: string }
  | { type: 'party/moved'; x: number; y: number; facing: Dir; fromX: number; fromY: number }
  | { type: 'party/turned'; facing: Dir }
  | { type: 'party/blocked'; reason: 'wall' | 'edge'; facing: Dir }
  | { type: 'party/teleported'; x: number; y: number; facing: Dir }
  | { type: 'party/fell' }
  | { type: 'door/toggled'; x: number; y: number; dir: Dir; open: boolean }
  | { type: 'door/locked'; keyId: string }
  | { type: 'interact/used'; kind: 'button' | 'lever' }
  | { type: 'char/damaged'; member: number; amount: number; hpCur: number }
  | { type: 'char/down'; member: number }
  | { type: 'item/taken'; name: string }
  | { type: 'item/dropped'; name: string };

export type EventType = GameEvent['type'];
export type EventOf<T extends EventType> = Extract<GameEvent, { type: T }>;

type Handler<E> = (event: E) => void;
type Unsubscribe = () => void;

export class EventBus {
  private handlers = new Map<EventType, Set<Handler<GameEvent>>>();
  private anyHandlers = new Set<Handler<GameEvent>>();

  on<T extends EventType>(type: T, handler: Handler<EventOf<T>>): Unsubscribe {
    let set = this.handlers.get(type);
    if (!set) {
      set = new Set();
      this.handlers.set(type, set);
    }
    const h = handler as Handler<GameEvent>;
    set.add(h);
    return () => set.delete(h);
  }

  /** Subscribe to every event (log panel, debug tracing). */
  onAny(handler: Handler<GameEvent>): Unsubscribe {
    this.anyHandlers.add(handler);
    return () => this.anyHandlers.delete(handler);
  }

  emit(event: GameEvent): void {
    // Snapshot before dispatch so handlers may unsubscribe (or subscribe)
    // during emit without corrupting iteration.
    const typed = this.handlers.get(event.type);
    const targets = typed ? [...typed, ...this.anyHandlers] : [...this.anyHandlers];
    for (const handler of targets) handler(event);
  }
}

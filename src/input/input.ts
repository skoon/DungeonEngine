/**
 * Keyboard input. Maps keys to abstract movement actions and calls the
 * supplied handlers — it has no reference to the core, keeping the boundary
 * clean (the caller wires actions to the Party). Mouse UX is M8.
 *
 * Bindings (classic crawler layout):
 *   forward   W / ArrowUp        back        S / ArrowDown
 *   strafe    A (left) D (right)  turn        Q/ArrowLeft, E/ArrowRight
 */

export type MoveAction =
  | 'forward'
  | 'back'
  | 'strafeLeft'
  | 'strafeRight'
  | 'turnLeft'
  | 'turnRight';

export type MoveHandlers = Record<MoveAction, () => void>;

const KEY_MAP: Record<string, MoveAction> = {
  w: 'forward',
  arrowup: 'forward',
  s: 'back',
  arrowdown: 'back',
  a: 'strafeLeft',
  d: 'strafeRight',
  q: 'turnLeft',
  arrowleft: 'turnLeft',
  e: 'turnRight',
  arrowright: 'turnRight',
};

/** Binds keydown handling; returns a cleanup that removes the listener. */
export function bindKeyboard(handlers: MoveHandlers): () => void {
  const onKey = (ev: KeyboardEvent): void => {
    if (ev.repeat) return; // one move per physical press; no auto-repeat spam
    const action = KEY_MAP[ev.key.toLowerCase()];
    if (!action) return;
    ev.preventDefault();
    handlers[action]();
  };
  window.addEventListener('keydown', onKey);
  return () => window.removeEventListener('keydown', onKey);
}

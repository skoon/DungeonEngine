/**
 * Trigger scripting — the data vocabulary for dungeon interactions (plan §5).
 * Buttons, levers, pressure plates and cell triggers all carry a list of
 * Actions; the World executor (world.ts) runs them. Keeping this as plain
 * data means puzzles live in the map JSON, not in code.
 *
 * Pure types only — depends on grid + events, never on dungeon/world, so
 * there is no import cycle.
 */

import type { Dir, Vec2 } from './grid';
import type { LogChannel } from './events';

/** Addresses one cell edge (resolved to a canonical key via dungeon.edgeKey). */
export interface EdgeAddr {
  x: number;
  y: number;
  dir: Dir;
}

export type Action =
  | { do: 'openDoor'; edge: EdgeAddr }
  | { do: 'closeDoor'; edge: EdgeAddr }
  | { do: 'toggleDoor'; edge: EdgeAddr }
  | { do: 'teleport'; to: Vec2; facing?: Dir }
  | { do: 'spin'; facing: Dir | 'random' }
  | { do: 'message'; channel: LogChannel; text: string };

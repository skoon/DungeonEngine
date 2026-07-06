---
name: make-map
description: Author a new dungeon level (map) for the DungeonEngine project — ASCII layout, doors, triggers, items, puzzle wiring, and tests. Use when the user asks to create, extend, or edit a dungeon map/level.
---

# Making a DungeonEngine Map

Maps are TypeScript content files: a `MapSource` object parsed at boot by
`parseMap()` ([src/core/mapParser.ts](../../src/core/mapParser.ts)). The parser
fails loudly on authoring mistakes — that's intended. Puzzles are **data**
(actions on edges/triggers), never engine code changes.

## Files to create/touch

1. `src/data/maps/<name>.ts` — the map (export a `MapSource` const).
2. `tests/data/maps/<name>.test.ts` — shape, connectivity, and solvability tests.
3. To make it the played level: swap the import in `src/main.ts`.

## Coordinate system — get this right first

- `x` grows **East** (right), `y` grows **South** (down). Row-major ASCII: the
  first ASCII row is `y=0`, first column is `x=0`.
- Directions: `Dir.N=0, Dir.E=1, Dir.S=2, Dir.W=3` from `src/core/grid.ts`.
  Import `Dir` and always use the names, never raw numbers.
- Every cell coordinate in `edges`/`triggers`/`floor` refers to the ASCII grid.
  Count carefully — off-by-one here is the #1 authoring bug. When in doubt,
  paste the ASCII with a column ruler comment above it.

## ASCII layout

```
'#'  solid rock (unwalkable)      ' '  also solid rock (bulk fill)
'.'  floor
'^' '>' 'v' '<'  floor + party start, pointing the starting facing
```

Rules enforced by the parser: all rows equal width; exactly one start glyph;
no other characters. Border the whole map with `#`.

## Edges (walls, doors, illusions, alcoves, buttons, text)

Edges sit **between** two cells and are addressed as `{ x, y, dir }` — the
edge on the `dir` side of cell `(x,y)`. Both neighbours resolve to the same
canonical edge, so define each edge **once** (from either side).

```ts
edges: [
  // thin wall between two open cells
  { x: 1, y: 1, dir: Dir.E },
  // door (starts closed; open: true to start open)
  { x: 2, y: 1, dir: Dir.E, kind: 'door' },
  // keyhole door — opens via `use` if any member carries the matching key
  { x: 2, y: 1, dir: Dir.E, kind: 'door', keyId: 'iron' },   // see data/items.ts keyId
  // secret door — renders as plain wall until opened
  { x: 4, y: 5, dir: Dir.E, kind: 'door', secret: true },
  // illusory wall — looks solid, walk straight through (logs a hint)
  { x: 3, y: 3, dir: Dir.N, kind: 'illusion' },
  // wall button / lever (lever toggles; button can be oneShot)
  { x: 2, y: 7, dir: Dir.S, interact: { kind: 'button', actions: [/* Actions */] } },
  // engraved text — logged when the party faces it
  { x: 6, y: 1, dir: Dir.N, text: '"WEIGHT OPENS THE WAY"' },
  // alcove niche holding items (looted with `use`)
  { x: 9, y: 1, dir: Dir.N, alcove: [item('gem')] },
]
```

## Triggers (floor cells) and floor items

```ts
triggers: [
  // pressure plate: onEnter/onLeave action lists (omit onLeave to latch)
  { x: 6, y: 3, kind: 'plate', visible: true,
    onEnter: [{ do: 'openDoor', edge: { x: 6, y: 4, dir: Dir.N } }],
    onLeave: [{ do: 'closeDoor', edge: { x: 6, y: 4, dir: Dir.N } }] },
  // teleporter, spinner, pit (pit deals 1d6 to each member), stairs, walltext
  { x: 9, y: 6, kind: 'teleporter', visible: true,
    onEnter: [{ do: 'teleport', to: { x: 11, y: 6 }, facing: Dir.S }] },
  { x: 5, y: 2, kind: 'spinner', visible: false, onEnter: [{ do: 'spin', facing: 'random' }] },
  { x: 3, y: 6, kind: 'pit', visible: true },
  { x: 11, y: 6, kind: 'stairs', visible: true, text: 'A stair spirals down...' },
],
floor: [
  { x: 2, y: 2, items: [item('rations'), item('dagger')] },
]
```

Action vocabulary (`src/core/triggers.ts`): `openDoor`, `closeDoor`,
`toggleDoor`, `teleport {to, facing?}`, `spin {facing | 'random'}`,
`message {channel, text}`. Log channels: combat/damage/loot/ambient/system.

Items come from the registry: `import { item } from '../items';` — valid ids
are the keys of `ITEMS` in [src/data/items.ts](../../src/data/items.ts).

## Design conventions (match Eye-of-the-Beholder feel)

- Corridors 1 cell wide; rooms small (3–5 cells); use pillars (`#` islands)
  for waltzing room in fight areas.
- Chain mechanics: plate→door, button→remote door, hidden button→secret door.
  Give every locked/secret thing a discoverable hint (wall text, visible
  plate, a glimpsed item).
- Teleporter destinations should be visually disorienting but fair; pair
  spinners with identical-looking corridors.
- Seal teleporter-only areas fully with `#` so BFS confirms they're
  unreachable on foot (test this).
- Plates with `onLeave` close behind you (hold-to-open); omit `onLeave` for
  latching plates.

## Required tests (copy the pattern from tests/data/maps/level1.test.ts)

1. **Shape**: width/height/start parse as intended.
2. **Connectivity**: `reachableCells(level, level.start.pos).size` equals
   `floorCount(level)` minus intentionally sealed cells (list them explicitly).
3. **Solvability**: drive the full solution through a `World` with a
   token-script helper (`F` forward, `l`/`r` turn, `u` use) and assert the
   end position + victory log line. If the map has a key/lock, prove both
   locked and unlocked paths.
4. **Gates hold**: assert doors block before their opener fires.

Run `npx tsc --noEmit && npm test` — both must pass. If `npm test` dies with
`Cannot find module @rollup/rollup-win32-x64-msvc`, run
`npm install @rollup/rollup-win32-x64-msvc --no-save` once and retry (known
npm optional-deps bug on this machine).

## Verifying visually (optional but recommended)

Start the `dungeonengine` preview server; if the tab reports
`document.visibilityState === 'hidden'`, rAF is suspended — use the DEV hooks
instead of screenshots: `window.__world` to drive
(`stepForward/turnLeft/turnRight/use`), `window.__frame()` to force a render,
then sample canvas pixels. `M` toggles the top-down debug minimap, `G` the
frustum-slot overlay.

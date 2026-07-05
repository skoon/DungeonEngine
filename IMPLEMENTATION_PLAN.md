# DungeonEngine — Grid-Based First-Person Dungeon Crawler

An engine in the style of *Eye of the Beholder* / *Dungeon Master*: a four-character
party explores a tile-based dungeon rendered in first-person pixel art, moving one
square at a time with 90° turns, fighting monsters in pseudo-real-time, and reading
about all of it in a scrolling message log.

This document is the design + implementation plan. Sections 1–7 describe the design;
Section 8 is the milestone-by-milestone build order.

---

## 1. Tech Stack & Project Layout

| Choice | Decision | Rationale |
|---|---|---|
| Language | TypeScript (strict) | Type safety for the entity/data model; refactors stay cheap |
| Renderer | HTML5 Canvas 2D, single `<canvas>` | Pixel art needs no GPU pipeline; `imageSmoothingEnabled = false` gives crisp scaling |
| Build | Vite | Instant dev server + HMR, trivial static deploy |
| Assets | PNG sprite sheets + JSON atlases | Standard pixel-art pipeline (Aseprite exports both) |
| Data | JSON (maps, items, monsters, classes) | Content is data, not code — modders and tools can edit it |
| Tests | Vitest | Pure-logic core (movement, combat, triggers) is unit-testable without a browser |

The engine renders to one **fixed internal resolution of 640×400** (classic VGA-era
aspect), then integer-scales to fit the window. All layout coordinates below are in
that internal space.

```
DungeonEngine/
├── index.html
├── src/
│   ├── main.ts                 # bootstrap, game loop
│   ├── core/                   # pure logic, zero canvas/DOM imports
│   │   ├── grid.ts             # Vec2, Direction, facing math
│   │   ├── dungeon.ts          # map model, cell queries
│   │   ├── party.ts            # party state, formation, movement rules
│   │   ├── character.ts        # stats, derived values, leveling
│   │   ├── inventory.ts        # items, equipment slots, hands
│   │   ├── combat.ts           # attack resolution, cooldowns, damage
│   │   ├── monster.ts          # monster state + AI state machine
│   │   ├── triggers.ts         # buttons, plates, teleporters, pits, doors
│   │   ├── events.ts           # typed event bus (feeds the log + renderer)
│   │   └── rng.ts              # seedable PRNG
│   ├── render/
│   │   ├── screen.ts           # canvas setup, integer scaling, palette
│   │   ├── viewport.ts         # first-person compositor (see §4)
│   │   ├── partyPanel.ts       # character pane
│   │   ├── logPanel.ts         # message log pane
│   │   └── sprites.ts          # atlas loading, draw helpers
│   ├── input/
│   │   └── input.ts            # keyboard + mouse routing per pane
│   ├── audio/
│   │   └── audio.ts            # sfx/music via WebAudio
│   └── data/                   # JSON content
│       ├── maps/level1.json
│       ├── items.json
│       ├── monsters.json
│       └── classes.json
├── assets/                     # PNG sheets: walls, portraits, monsters, ui
└── tools/
    └── mapedit/                # (later) browser-based map editor
```

**Core rule:** `src/core/` never imports from `render/`, `input/`, or `audio/`.
The core emits typed events; presentation layers subscribe. This keeps the whole
game simulation headless-testable and makes save/load trivial (core state is one
serializable object).

---

## 2. Screen Layout — The Three Panes

Classic EOB arrangement: viewport top-left, party roster on the right, log below
the viewport.

```
640×400 internal resolution
┌──────────────────────────────────┬──────────────────────┐
│                                  │  PARTY PANEL (200×400)│
│      FIRST-PERSON VIEWPORT       │ ┌──────────────────┐ │
│           (440×290)              │ │ [portrait] Name   │ │
│                                  │ │ HP ▓▓▓▓▓░ MP ▓▓░ │ │
│   3D-style dungeon view drawn    │ │ [L hand] [R hand]│ │
│   from layered wall sprites      │ ├──────────────────┤ │
│                                  │ │ char 2           │ │
│                                  │ ├──────────────────┤ │
├──────────────────────────────────┤ │ char 3           │ │
│  MESSAGE LOG (440×110)           │ ├──────────────────┤ │
│  > You hear a distant grinding.  │ │ char 4           │ │
│  > Thorin hits the skeleton.     │ └──────────────────┘ │
│  > The skeleton is destroyed!    │  [compass / buttons]  │
└──────────────────────────────────┴──────────────────────┘
```

### 2.1 First-person viewport (440×290)
The dungeon view. Also an input surface: clicking a door/button/lever in the front
cell interacts with it; clicking the floor throws/picks up items; clicking a monster
with a weapon-armed cursor attacks (mouse support is a later milestone — keyboard
first).

### 2.2 Party panel (200×400)
Four stacked character cards (~200×90 each), plus a compass and turn buttons at the
bottom. Each card shows:

- **Portrait** (32×32) — grays out at 0 HP, flashes red on damage taken.
- **Name + condition icons** (poisoned, paralyzed, dead).
- **HP / MP bars** with numeric readout.
- **Two hand slots** (left/right): the equipped weapon/item, drawn as its icon.
  Clicking a hand attacks with it (melee/ranged) or activates it; while on
  cooldown the slot is drawn darkened with a sweep animation.
- Clicking the portrait opens the **inventory sheet** overlay (paper-doll +
  backpack grid) over the viewport area.

Party formation is 2×2: front rank (slots 0,1) can melee; back rank (2,3) needs
polearms/ranged/spells. Clicking a card border swaps characters between slots.

### 2.3 Message log (440×110)
Scrolling text, newest at bottom, ~6 visible lines in an 8×8 bitmap font. Color-coded
by event class: combat (white), damage to party (red), loot/discovery (yellow),
ambient/flavor (gray), level-ups & quest (green). Mouse-wheel scrollback over a
200-line ring buffer. Every log line originates from a core event — the log panel is
just a subscriber, which guarantees the log reflects exactly what the simulation did.

### 2.4 Pixel-art discipline
- All drawing at 1:1 into the 640×400 backbuffer; final blit integer-scales (×2 on
  1080p, ×3 on 1440p) with smoothing off. No sub-pixel positions anywhere.
- Shared 32-color master palette; depth-fog in the viewport uses palette swaps
  (2 darkened variants per wall sheet), not alpha, to keep the retro look.
- UI chrome (pane borders, stone frame) is a nine-slice sprite sheet.

---

## 3. Core Model

### 3.1 Grid & facing
```ts
type Direction = 0 | 1 | 2 | 3;            // N, E, S, W
interface Vec2 { x: number; y: number }
// forward(dir), left(dir), right(dir), back(dir) — pure helpers
```
The party occupies exactly one cell and faces one direction. Movement is discrete:
`stepForward`, `stepBack`, `strafeLeft/Right`, `turnLeft/Right`. Each takes a fixed
duration (~250 ms) during which input is buffered (one queued move, EOB feel).

### 3.2 Dungeon map
A level is a `width × height` array of cells:

```ts
interface Cell {
  floor: number;                // 0 = solid rock (unwalkable)
  wallN?: WallRef; wallE?: WallRef; wallS?: WallRef; wallW?: WallRef;
  door?: DoorState;             // door lives on a cell edge, N/S or E/W oriented
  decor?: DecorRef[];           // torches, alcoves, writing, illusory walls
  trigger?: TriggerRef;         // plate, teleporter, pit, spinner, stairs
  items: ItemStack[];           // loose items on the floor (per quadrant)
}
```

Walls live on **cell edges** (each edge stored once, referenced by both neighbors)
so a wall can be a plain wall, a button, a lever, an alcove with an item, or an
illusory wall — all edge-addressable and clickable. Maps are authored as JSON
(hand-written for level 1; map editor tool in a later milestone).

### 3.3 Characters
```ts
interface Character {
  name: string; portrait: number;
  clazz: 'fighter' | 'cleric' | 'mage' | 'thief';
  stats: { str: number; dex: number; con: number; int: number; wis: number };
  level: number; xp: number;
  hp: { cur: number; max: number };  mp: { cur: number; max: number };
  conditions: Set<Condition>;        // poisoned, paralyzed, unconscious, dead
  hands: [Item | null, Item | null];
  cooldowns: [number, number];       // ms remaining per hand
  equipment: EquipmentSlots;         // armor, helm, boots, rings…
  backpack: (Item | null)[];         // 14 slots
}
```
Derived values (AC, attack bonus, damage, carry weight) are pure functions of the
character — computed, never stored, so they can't go stale.

### 3.4 Time model: pseudo-real-time
Faithful to EOB: the world runs on a real-time clock, but everything is quantized.

- **Simulation tick:** 100 ms. Monsters act on their own per-monster timers
  (move every ~800–1500 ms, attack every ~1500–3000 ms, per species).
- **Attack cooldowns:** each weapon sets a per-hand cooldown (dagger 600 ms,
  two-hander 2200 ms). Clicking/keying an attack during cooldown does nothing.
- **Passive regen/poison/hunger** tick on slow timers.
- Pausing (inventory open, game menu) freezes the simulation clock.

This gives combat its classic rhythm — waltzing (step-attack-strafe) works, but
monsters keep coming while you fumble in your backpack unless you pause.

### 3.5 Event bus
Every observable simulation fact is an event:
`PartyMoved`, `PartyBumpedWall`, `DoorOpened`, `AttackResolved{attacker, target, roll, damage}`,
`MonsterDied`, `ItemPickedUp`, `TriggerFired`, `TextTriggered{message}`, `LevelUp`…
Subscribers: log panel (formats to text), audio (footsteps, hits, door grind),
viewport (damage flashes, projectile sprites), party panel (HP flash). The core
never formats strings — presentation owns wording.

---

## 4. First-Person Renderer (the interesting part)

No raycasting. Like the original, the viewport is a **painter's-algorithm sprite
compositor** over a fixed view frustum. This is what makes it *look* like EOB
instead of like Wolfenstein.

### 4.1 View frustum
The camera sees a trapezoid of cells in front of the party, 4 rows deep:

```
row 3 (far):   [-3][-2][-1][ 0][+1][+2][+3]     7 cells
row 2:             [-2][-1][ 0][+1][+2]         5 cells
row 1:                 [-1][ 0][+1]             3 cells
row 0 (near):          [-1][ 0][+1]             3 cells (party stands in row0/0)
```

Each (row, lateral) slot has **pre-computed screen rectangles** for its three
possible wall faces: *front face* (wall on the far edge, facing the camera) and
*side faces* (walls on the left/right edges, seen at an angle). These rects are
constants in a table (`viewGeometry.ts`) — tuned once by hand, used forever.

### 4.2 Wall sprite atlas
For each wall style (brick, sewer, crypt…), the atlas contains one pre-drawn,
pre-perspective sprite per (row, |lateral|, face) combination — left-side sprites
are mirrored from right-side ones at load time. That's ~10 unique sprites per
wall style. Rows 2–3 use the darkened palette variants for depth fog.

### 4.3 Draw order (per frame, only when dirty)
1. Ceiling gradient + floor gradient (two static images per tileset).
2. For `row = 3 → 0`, for `lateral = outermost → 0`:
   a. front-face wall of the cell behind (closes off the corridor),
   b. side walls,
   c. door (drawn in its edge slot; sliding doors draw partially open by clipping),
   d. wall decor (buttons, levers, torches — same slot geometry as walls),
   e. floor items (billboard sprites scaled per row, positioned per quadrant),
   f. monsters (billboard sprites, per-row scale, bob animation offset),
   g. projectiles/particles in that row.
3. Overlays: damage flash, spell effects, "darkness" vignette if no light source.

The viewport only re-renders on state change (move, turn, door animation frame,
monster move, item change). During move/turn there is **no smooth interpolation** —
classic instant steps, with an optional 2-frame "lurch" wipe for feel, decided in M3.

### 4.4 Monsters in the viewport
Monsters are billboards with 3 scale tiers (row 1/2/3), front/side/back poses per
species, 2-frame walk and attack animations. A monster in the same row+lateral as
a wall edge is clipped by draw order automatically. Clicking a monster (M8, mouse
combat) hit-tests against per-row bounding boxes recorded during the draw pass.

---

## 5. Dungeon Interactions

All EOB staples, each one a `Trigger` in core with data-driven parameters:

| Feature | Behavior |
|---|---|
| Doors | Button/lever/keyhole/plate-operated; sliding animation; can crush/block; monsters can open some |
| Pressure plates | Fire on party/monster/item weight enter+leave; visible or hidden variants |
| Wall buttons/levers | Clickable in viewport (front cell); toggle or one-shot |
| Teleporters | Silent or shimmer-visible; can rotate the party — combined with spinners for classic disorientation |
| Pits | Open/closed/illusory; drop to level below (damage); closable by lever; thrown items fall through |
| Pit spinners | Invisible facing rotation on cell entry |
| Alcoves & item slots | Wall niches holding items; some are "feed me an item" locks (put gem in mouth) |
| Wall text | Engraved messages → gray log line + rendered decal |
| Illusory walls | Render as wall, but walkable; log hint on bump ("Your hand passes through!") |
| Stairs/ladders | Level transitions preserving party facing |
| Secret doors | Wall that opens via hidden button; thief passive-detect chance → log hint |

Levels are linked by stairs/pits into one persistent multi-floor dungeon: dropped
items stay, opened doors stay open, dead monsters stay dead (state serialized per
level, all levels in one save blob).

---

## 6. Combat, Items, Magic

### 6.1 Attack resolution (d20-ish, data-driven)
```
roll = d20 + attacker.attackBonus (class/level/str/weapon)
hit if roll >= target.AC
damage = weapon dice + str mod (melee) — armor absorbs nothing (AC-only, classic)
```
Front-rank characters can melee row-1 center cell targets; back rank needs reach
or ranged. Thrown/shot projectiles travel cell-by-cell (visible in viewport),
land on the floor where they stop, and can be picked back up — the classic
"darts economy."

### 6.2 Items
One JSON registry: weapons (damage dice, cooldown, reach/thrown/ammo flags),
armor (AC bonus, slot), consumables (food, potions), quest items, keys.
Weight → carry limit → hunger drain. Items are instances (charges, poison state)
referencing registry templates.

### 6.3 Magic (kept simple, expandable)
Mana-point casting (not Vancian memorization — simpler UI, one fewer screen).
Spellbook per caster; casting from a hand slot UI: click staff/holy-symbol hand →
radial spell pick → target. Initial spell set: Magic Missile, Burning Hands
(cone, hits row-1 cells), Shield, Cure Wounds, Light, Detect Secret.
Spell projectiles reuse the thrown-item cell-travel system.

### 6.4 Death & camping
0 HP → unconscious (dies at −10 via bleed ticks); dead characters are carried as
bones items (resurrection altar in later levels — classic). **Camp** action rests
the party: hours pass in fast ticks, regen + hunger + wandering-monster checks.

---

## 7. Persistence & Content Pipeline

- **Save/load:** the entire core state (party, all level states, RNG seed, clock)
  is one JSON blob → `localStorage` + import/export as file. Autosave on stairs.
- **Content:** `data/*.json` validated at load with zod schemas — a bad monster
  entry fails loudly at boot, not silently mid-game.
- **Map format:** designed so a future browser map editor (`tools/mapedit`) reads
  and writes the same JSON. Until then, level 1 is hand-authored with a helper
  that parses an ASCII-art layout string into cells (fast to iterate, diffs well).

---

## 8. Implementation Milestones

Each milestone ends in a **playable, demoable state**. Estimates assume focused
solo work.

### M0 — Skeleton (½ day)
Vite + TS strict + Vitest scaffold. 640×400 canvas with integer scaling and a
test pattern proving crisp pixels at ×2/×3. Game loop (fixed 100 ms sim tick,
rAF render). Event bus. Seedable RNG.
**Done when:** test pattern renders scaled and sharp; `npm test` runs a trivial core test.

### M1 — Grid world, headless (1 day)
`core/grid`, `core/dungeon`, ASCII-map parser, party movement rules (walls block,
solid rock blocks), facing math. Level-1 map authored in ASCII. No rendering —
proven entirely by unit tests (move, turn, bump, strafe round-trips).
**Done when:** test suite walks the whole level-1 map by script and asserts positions.

### M2 — Three-pane UI shell (1 day)
Pane layout + nine-slice chrome at final coordinates (§2). Log panel rendering
event-bus text with colors + scrollback. Party panel with 4 placeholder cards
(static bars). Viewport pane shows a top-down debug minimap **stand-in** so
movement is visible before the real renderer exists. Keyboard input
(WASD+QE / arrows) driving the core.
**Done when:** you can walk the map watching the minimap, and every bump/step logs.

### M3 — First-person renderer (2–3 days) ⟵ the crux
View-frustum geometry table, wall atlas (one "brick" tileset: front/side sprites
× 4 rows, 2 fog palettes), painter's-algorithm compositor, ceiling/floor images.
Debug overlay showing (row, lateral) slot outlines. Replace M2's minimap
(minimap moves to a debug hotkey — keep it forever, it's invaluable).
**Done when:** walking level 1 looks like EOB — corridors, corners, and rooms all
render correctly from all 4 facings (verified against the minimap with a scripted
walk + screenshot goldens).

### M4 — Doors, triggers, dungeon furniture (2 days)
Edge-addressed doors with sliding animation; buttons/levers (clickable via
keyboard "use" first); pressure plates, teleporters, spinners, pits (multi-level
falls stubbed to damage-only until M9), wall text, illusory walls, alcoves.
Trigger scripting is data in the map JSON.
**Done when:** a level-1 puzzle sequence (plate → door, button → teleporter, secret
wall) is completable start to finish.

### M5 — Party, characters, inventory (2 days)
Real character model (§3.3), classes.json, party panel live (portraits, bars,
hand slots, formation swap). Inventory sheet overlay: paper-doll + backpack,
keyboard cursor; floor item pickup/drop rendered in viewport per quadrant.
Pause-while-inventory.
**Done when:** you can loot an alcove, equip a sword to a front-rank hand, drop
rations on the floor, walk away, come back, and they're still there.

### M6 — Monsters & combat (2–3 days)
Monster registry + billboard rendering + AI state machine (idle → hunt (hear/see)
→ attack → flee-at-low-HP for smart species), per-monster timers, grid pathing
(BFS, ~12-cell radius). Attack resolution both directions, cooldown UI on hand
slots, damage flashes, death + XP + corpse loot. Two species: skeleton (melee,
dumb) and kobold (melee, flees).
**Done when:** you can clear a guarded room, kite a skeleton by waltzing, and die
to a mob if you stand still.

### M7 — Projectiles, ranged & magic (2 days)
Cell-traveling projectile system (thrown daggers, sling, monster spit), landing
items recoverable. Mana casting UI + the six starter spells (§6.3). Back-rank
reach rules.
**Done when:** a mage in the back rank can Magic-Missile a kobold at row 3, and
you can retrieve your thrown daggers after the fight.

### M8 — Mouse UX polish (1–2 days)
Full mouse support: click viewport to use/pick/throw/attack (hit-test boxes from
§4.4), click hands to attack, drag-and-drop inventory, click-to-swap formation.
Compass + on-screen movement buttons (pure EOB cosplay, and touch-friendly).
**Done when:** the game is fully playable mouse-only *and* keyboard-only.

### M9 — Multi-level dungeon, save/load, camping (1–2 days)
Level linking (stairs, pit falls land on the level below), per-level state
persistence, full save/load + autosave, camp/rest with hunger + wandering
monsters, food economy.
**Done when:** fall through a pit on L1, land hurt on L2, camp to heal, save,
reload, and everything (dropped items, open doors, dead monsters) persists.

### M10 — Content & feel pass (ongoing)
Second wall tileset, 4+ more monster species, boss, sound effects (footsteps,
door grind, hits, ambient drips), title screen + party creation screen,
levels 2–3, resurrection altar, balancing. Map editor tool if content velocity
demands it.

**Total to "feels like EOB" (M0–M9): ~13–17 focused days.**

---

## 9. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| M3 viewport geometry looks "off" (the make-or-break) | Geometry is a hand-tunable constant table + debug slot overlay; iterate with screenshot goldens. Budget extra time here — everything else is conventional. |
| Pixel-art asset volume | Frustum design needs only ~10 wall sprites/tileset; monsters need only 3 scales × few poses. Start with placeholder programmer art at correct sizes so geometry work never blocks on art. |
| Real-time combat feels unfair vs. original | All timings (cooldowns, monster speeds) live in JSON — tune without rebuilds. Keep the pause-in-inventory rule. |
| Scope creep in magic/RPG systems | Mana (not Vancian), 6 spells, 4 classes, 5 stats. Expand only after M9. |
| Edge-stored walls double-update bugs | Single source of truth: edges owned by a canonical (cell, side) key; both neighbors resolve through it. Unit-test door open/close from both sides in M4. |

---

## 10. First Session Checklist (start of M0)

1. `npm create vite@latest . -- --template vanilla-ts`
2. Enable strict TS, add Vitest, add `src/core`–`src/render` import-boundary lint rule.
3. Canvas scaler with test pattern; verify at 3 window sizes.
4. Commit the ASCII map format decision with the parser stub.

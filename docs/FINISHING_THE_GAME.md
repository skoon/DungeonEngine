# Finishing the Game — Roadmap & Genre-Porting Guide

The plan for taking DungeonEngine from "feels like *Eye of the Beholder*" (where it is
today) to a **finished, shippable game** — and then a guide to re-skinning the engine
into entirely different genres (Steampunk, Science Fiction, …).

Companion documents:
- [`IMPLEMENTATION_PLAN.md`](../IMPLEMENTATION_PLAN.md) — the original engine design & M0–M10 build order
- [`docs/DEATH_AND_REVIVAL.md`](DEATH_AND_REVIVAL.md) — death, Town Hub & economy design (M-DR1..DR6)
- [`docs/CREATING_SPRITES.md`](CREATING_SPRITES.md) — art sizes & the sprite pipeline spec

---

## Part 1 — Where the game stands

| Milestone | Status | What landed |
|---|---|---|
| M0–M9 | ✅ complete | Skeleton, grid core, 3-pane UI, first-person renderer, doors/triggers, party/inventory, monsters/combat, projectiles/magic, mouse UX, multi-level + save/load + camping |
| M10 (ongoing) | ✅ large slice | WebAudio SFX layer, crypt tileset, 7-species bestiary + Bone Lord boss, resurrection altar, title screen, XP/leveling, party creation |
| M-DR1 (death core) | ✅ landed | Bleed-out to −10, permanent `'dead'`, `char/died`, roster tests |
| M-DR2 (gold economy) | ✅ landed | Party purse (`Roster.gold`), monster gold drops, save round-trip |
| M-DR3..DR6 | ⬜ next | Town Portal spell, Town Hub level, raise/replace services, presentation, balance |

**~200 tests**, all green. The architecture that got us here is the one to protect while
finishing: `src/core/` is pure and headless (never imports `render/`, `input/`, or
`audio/` — enforced by `tests/core/boundaries.test.ts`), all content lives in
`src/data/` registries, and presentation subscribes to semantic events. Every milestone
below ends demoable with the suite green.

---

## Part 2 — Milestones to a finished game

Estimates assume focused solo work, matching the original plan's convention.

### M11 — Death, Town & Economy (2–4 days)
Adopt [`DEATH_AND_REVIVAL.md`](DEATH_AND_REVIVAL.md) **M-DR3 → M-DR6** as specified there
(the detail lives in that doc; don't duplicate it):
- **M-DR3** Town Portal spell + recall anchor (survives save/load; refused in combat).
- **M-DR4** Town Hub level (a normal `Level`, no spawns) with raise / recruit / rest /
  return service cells; `raiseDead(i)` / `replaceMember(i, c)` in core.
- **M-DR5** Presentation: town-service overlay (reusing `render/createScreen.ts` widgets
  for Replace), skull/gray portraits for the dead, gold readout.
- **M-DR6** Tuning: bleed rate, raise/recruit costs, monster gold ranges.

Plus one item DEATH_AND_REVIVAL leaves optional, promoted to required here:
a **game-over screen** consuming the `party/wiped` event (title-screen return + "load
last save" option).

**Done when:** a member dies permanently, the party portals to town, the player chooses
raise *or* replace (rolling a fresh adventurer via the creation flow), returns to the
recall point, and a full wipe lands on a game-over screen instead of a soft-locked crawl.

### M12 — Balance pass (1–2 days)
The known problem: the difficulty cliff from the Pillared Hall into the crypt — a fresh
level-1 party cannot touch the Zombie (18 HP, 1d8) or the Bone Lord (44 HP, AC 16).
All numbers already live in data registries, so this is tuning, not engineering:
- Monster stats/timers (`src/data/monsters.ts`), weapon dice/cooldowns
  (`src/data/items.ts`), spell costs/damage (`src/data/spells.ts`), XP curve
  (`src/core/leveling.ts` — `xpToReach`), pit damage, camp/hunger economics.
- Author a deliberate **grind loop** on level 1 (respawning-ish low-XP encounters via
  camp-wanderers) so reaching level 2–3 before descending is a real strategy.
- Add a tuning harness: a headless script that auto-fights N seeded battles per matchup
  and prints kill-times/death-rates, so balance changes are measured, not vibes.

**Done when:** a careful level-1 party can clear level 1, gets to ~L3 before the crypt,
and the Bone Lord is hard-but-beatable at L3–4 (measured by the harness).

### M13 — Boss behavior & combat depth (2 days)
Make the Bone Lord a setpiece instead of a stat brute, using hooks that already exist:
- **Phases:** at ½ HP, summon 2 skeletons (the wanderer-spawn path `findSpawnSpot` /
  `spawnMonster` in `src/core/world.ts` already does safe placement) and shorten its
  timers (enrage). Model as optional `phases?: { atHpFrac, summon?, speedMult? }[]` on
  `MonsterSpecies`.
- **Monster ranged attacks:** the projectile system already supports
  `from: 'monster'` and `World.resolveProjectileVsParty()` — currently unused. Add
  `ranged?: { damage, hopMs, range, glyph }` to a species (give the Wraith a chill bolt)
  and fire it from the AI when line-of-sight but not adjacent.
- **Poison that ticks:** the `'poisoned'` condition exists but does nothing. Give the
  Cave Spider a poison chance on hit; tick 1 HP per few seconds in `Roster` (mirroring
  `bleed()`); cured by camp/Cure Wounds (both already clear it).

**Done when:** the Bone Lord summons and enrages mid-fight, the Wraith snipes down
corridors, spider poison pressures the party between fights — all headless-tested.

### M14 — Content expansion (3–5 days)
- **Levels 3–5** authored per the `make-map` skill conventions (`.claude/skills/make-map/`)
  — each with a puzzle chain, a themed encounter mix, and a one-way "point of no return"
  moment. Extend `src/data/maps/index.ts` ordering; keep the connectivity/solvability
  test pattern from `tests/data/maps/level1.test.ts`.
- **Third tileset** (`src/render/tilesets.ts` — e.g. a fiery "forge" ramp for the deep).
- **3–5 new species** + a **final boss** using the M13 phase machinery.
- **Quest arc & victory:** a McGuffin item on level 5; carrying it to the exit triggers a
  victory screen (a `'stairs'`-like trigger that checks the party's packs).

**Done when:** the game is completable start-to-victory in 60–90 minutes with a
beginning, escalation, and an ending screen.

### M15 — Art integration: the sprite atlas loader (2–3 days + art time)
Build `src/render/sprites.ts` to the spec in [`CREATING_SPRITES.md`](CREATING_SPRITES.md):
- Load PNG sheets + JSON atlases from `assets/`; slice named sub-images; mirror
  right→left side-wall sprites at load; support frame strips (`frames`, `ms`).
- **Swap-in points:** `drawFrontFace` / `drawSideFace` / `drawFrontDoor` (walls, doors),
  `drawMonster` (billboards by row tier), `drawItemIcon` (items), `partyPanel` portraits,
  `chrome.ts` 9-slice frames, floor markers.
- **The fallback rule is the design:** wherever no atlas entry exists, the current
  procedural art keeps drawing. That makes art droppable incrementally — one tileset,
  one monster at a time — including the user's custom per-genre sprites later.

**Done when:** dropping a correctly-named PNG+JSON into `assets/` re-skins that element
with zero code changes, and deleting it falls back cleanly.

### M16 — Audio & feel polish (1–2 days)
- **Ambient loops per tileset** (dripping brick, crypt wind) — synthesized like the SFX
  layer, keyed off `level/changed`.
- A simple **music stub** (2-track drone/pulse, mutable separately).
- Feel options: brief hit-pause on melee connects, a 1–2px screen shake on heavy hits
  (respect a "reduce motion" toggle), log color/wording pass.

**Done when:** playing with sound on has a continuous soundscape and combat has tactile
weight; all toggleable.

### M17 — Ship it (1–2 days)
- `vite build` static bundle; verify integer-scaling and audio-unlock behavior in the
  built output. Deploy to itch.io (zip upload) and/or GitHub Pages.
- **Save versioning policy:** bump `VERSION` in `src/save/save.ts` on breaking changes;
  keep the graceful-reject path tested (it already returns `false` on mismatch).
- Performance sanity: the painter's renderer redraws every frame; if profiling shows
  waste, add the plan's original dirty-flag (§4.3) — only re-render on state change.
- README (controls, building), in-game help screen (the key list currently lives in one
  log line), an itch page with screenshots.

**Done when:** a stranger can click a URL, play to the victory screen, and their save
survives a refresh.

### M18 — Map editor (optional, 3–4 days)
A browser tool (separate Vite page) that reads/writes the `MapSource` format: paint
cells, place edges/triggers/spawns from dropdowns of the real registries, and export
the TypeScript/JSON literal. Worth building only if levels 6+ or community content are
wanted — the ASCII format plus the `make-map` skill remain perfectly serviceable.

**Total to shipped (M11–M17): roughly 12–18 focused days.**

---

## Part 3 — Porting the engine to other genres

The engine was built content-out: the renderer, grid, AI, combat math, and save system
are theme-blind, and everything nameable lives in `src/data/` registries. A genre port
is therefore a **theme pack**, not a fork of the engine.

### 3a. Inventory of genre coupling (what's data, what's code)

| Effort | Piece | Where | Notes |
|---|---|---|---|
| **Pure data — no code** | Items, monsters, classes, spells, starting party, name pool | `src/data/items.ts`, `monsters.ts`, `classes.ts`, `spells.ts`, `party.ts`, `creation.ts` | The whole nameable world |
| | Maps / levels | `src/data/maps/*` | Author with the `make-map` skill |
| | Wall/ceiling/floor color ramps | `src/render/tilesets.ts` | Already per-level via `tileset:` id |
| | Sprites (once M15 lands) | `assets/` | Sized per CREATING_SPRITES.md |
| **Small code touches** | Master 16-color palette | `src/render/palette.ts` (`SWEETIE16` + semantic `COLORS`) | Swap the ramp; UI follows |
| | Log wording & labels ("mana", "You pull the lever") | `src/render/logPanel.ts`, `partyPanel.ts`, overlays, `World`'s `msg()` strings | Core emits semantic events; wording is one layer |
| | Audio recipes | `src/audio/audio.ts` | Each event's synth is a few lines: footstep→servo whine, door grind→hydraulic hiss |
| | New mechanic kinds | `SpellKind` in `src/core/spell.ts`; trigger kinds in `src/core/dungeon.ts` | Only if the genre adds a genuinely new verb |
| **Genuine engine work** | — none for a re-skin | | Frustum renderer, pathing, combat, saves: all theme-neutral |

Two deliberate recommendations:
1. **Relabel, don't rename.** `mp` can *display* as "Steam Pressure" or "Energy Cells";
   `camp` can display as "Cryo-rest". Renaming core fields buys nothing and churns the
   save format. All player-facing words live in the render layer.
2. **Reuse mechanics under new fiction.** A teleporter is a pneumatic tube; stairs are
   an elevator; the altar is a repair bench; Town Portal is a shuttle recall. Same
   trigger kinds, new floor-marker art + log lines. Only add a new `SpellKind`/trigger
   kind when the *rules* differ, not the flavor.

### 3b. The theme-pack recipe (ordered steps)

1. **Fork the data registries.** Copy `src/data/` content files and rewrite ids, names,
   stats, kits, and the creation name pool. (A future refactor could make
   `src/data/themes/<name>/` selectable at the title screen — trivial because everything
   already flows through these modules.)
2. **Palette + tileset.** Replace the 16-color ramp in `palette.ts` (keep 16 — the
   discipline is the aesthetic) and add tileset ramps in `tilesets.ts`; set `tileset:`
   per map.
3. **Author maps** with the `make-map` skill; the trigger vocabulary (plate, door,
   teleporter, pit, spinner, stairs, altar) covers most genre furniture under new names.
4. **Reword the presentation layer:** log lines, panel labels, overlay titles, and the
   flavor strings passed through map `message` actions and `World.msg()` calls.
5. **Re-recipe the audio** per event in `audio.ts` (same bus subscriptions, new synths).
6. **Sprites** per `CREATING_SPRITES.md` sizes into `assets/` (after M15) — walls,
   billboards, icons, portraits, chrome.
7. **(Only if needed) new mechanics:** add a `SpellKind` (e.g. `'hack'`, `'scan'`) with a
   `case` in `World.cast`, or a trigger kind, with headless tests — a few dozen lines each.

### 3c. Worked example — Steampunk dungeon ("The Brass Undercroft")

| Fantasy | Steampunk | Step | Code needed? |
|---|---|---|---|
| sweetie-16 palette | Brass/copper/verdigris/soot 16-ramp | 2 | palette swap only |
| Fighter / Cleric / Mage / Thief | Engineer / Alchemist / Artificer / Saboteur | 1 | data |
| Mana (`mp`) | **Steam Pressure** (label only) | 4 | data/wording |
| Magic Missile (projectile) | Rivet Gun | 1 | data |
| Burning Hands (cone) | Boiler Vent (scalding steam) | 1 | data |
| Shield (buff) | Aegis Plating | 1 | data |
| Cure Wounds (heal) | Patch Kit / Restorative Tonic | 1 | data |
| Light / Detect Secret | Arc Lamp / Resonance Gauge | 1 | data |
| Skeleton, Kobold, Zombie, Wraith, Bone Lord | Clockwork Footman, Scrap Rat, Pressure Ghoul, Steam Wraith, **Boiler Tyrant** boss | 1 | data |
| Door / secret door | Bulkhead / false boiler-plate | 3 | art + wording |
| Teleporter / spinner | Pneumatic tube / gyroscope plate | 3 | art + wording |
| Altar / camp | Repair bench / stoking a brazier | 4 | wording |
| Town Hub / Town Portal | Airship dock / Recall Beacon | 4 | wording |
| Door grind / footstep SFX | Hydraulic hiss / boot-on-grating | 5 | audio recipes |
| *New verb:* `'hack'` a clockwork monster (brief stun) | — | 7 | **~30 lines**: new `SpellKind` + `World.cast` case + test |

Everything above the last row is data, art, and strings. One optional new mechanic
crosses into (small) code.

### 3d. Worked example — Science-Fiction dungeon ("Derelict *UES Barrow*")

| Fantasy | Sci-Fi | Step | Code needed? |
|---|---|---|---|
| sweetie-16 palette | Cold hull-gray / emergency-red / neon-cyan 16-ramp | 2 | palette swap |
| Classes | Marine / Medic / Technician / Scout | 1 | data |
| Mana | **Energy Cells** (label only) | 4 | data/wording |
| Magic Missile / Burning Hands | Laser Pistol / Plasma Cone | 1 | data |
| Detect Secret | Sensor Sweep | 1 | data |
| Thrown dagger economy | Throwing knives → recoverable flechettes | 1 | data |
| Monsters | Maintenance drones, xenomorph skitterers, irradiated crew, **Hive Node** boss | 1 | data |
| Stairs / pit | Elevator / open shaft | 3 | art + wording |
| Camp / rations | Cryo-rest / ration packs | 4 | wording |
| Town / Town Portal | Docked shuttle / Shuttle Recall | 4 | wording |
| Torches, wall text | Flickering panels, terminal logs (`walltext` triggers) | 3 | data |
| Combat feel | Ranged-heavy: give most species `ranged` attacks | — | rides on **M13**'s monster-ranged work |
| *New verb:* `'scan'` (reveal monsters on the debug-map overlay) | — | 7 | **~30 lines** |

The sci-fi port leans harder on projectiles — which is exactly M13's monster-ranged
milestone — so build that first and the genre gets its firefights for free.

### 3e. Bottom line

A committed genre port is roughly: **1–2 days** of registry/wording/palette/audio work,
plus map authoring, plus art at the sizes in `CREATING_SPRITES.md` — with **near-zero
engine risk**, because the core never knew it was a fantasy game in the first place.

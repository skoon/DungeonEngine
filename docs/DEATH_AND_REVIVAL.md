# Death, Revival & the Town Hub

A design + milestone plan for permanent party-member death and how the player
recovers from it. Companion to `IMPLEMENTATION_PLAN.md` (extends §6.4 "Death &
camping"); sections 1–6 are the design, section 7 is the build order.

---

## 0. Where we are today (as of M10)

- `Roster.damage()` (`src/core/roster.ts`) flags `'unconscious'` at 0 HP, emits
  `char/down`, and **clamps HP at 0**. Nothing ever reaches the `'dead'` condition
  that already exists on `Character` (`src/core/character.ts`).
- Revival exists only via the free resurrection **altar** (`World.reviveAtAltar`,
  `src/core/world.ts`, an `'altar'` cell trigger — level2 at (1,7)) and Cure Wounds
  healing above 0.
- `party/wiped` is emitted but consumed nowhere (no game-over).

Result: there is no permanent loss, and no reason for a town. This doc adds both.

---

## 1. Death trigger — bleed-out to −10

Three HP bands replace the "0 = unconscious, clamped" model:

| HP | State | Behavior |
|---|---|---|
| `> 0` | active | normal |
| `<= 0` and `> -10` | **unconscious / dying** | disabled; **bleeds −1 HP per bleed tick**; healed above 0 → wakes (existing `heal()` path) |
| `<= -10` | **dead** | permanently disabled; `'dead'` condition set; only town/altar revival restores |

Changes vs. today:

- **`Roster.damage()` stops clamping at 0 for already-downed members**, so further
  damage drives HP negative toward −10. The *first* hit to ≤0 still just sets
  `'unconscious'` and emits `char/down` (trigger unchanged). Crossing −10 promotes
  to dead immediately — so a single massive hit to an unconscious member kills
  outright ("dying while already unconscious" folds into the same −10 gate).
- **Bleed tick:** each sim tick, every unconscious (not-yet-dead) member loses 1 HP
  on a slow timer (~1 HP/sim-second, tunable). At `<= -10` they die. Implemented as
  `Roster.bleed(dtMs, bus)` called from `World.tick()` (which already ticks
  cooldowns/buffs), keeping the rule in core and event-only.
- **New event `char/died { member }`** (distinct from `char/down`), added to the
  `GameEvent` union in `src/core/events.ts`. `party/wiped` reused unchanged.
- `isDisabled()` already treats `'dead'` as disabled; `everyoneDown()` already ends
  the run when all are dead/unconscious — no change needed.

---

## 2. The "bones" carry mechanic

A dead adventurer **stays in their roster slot** (the party is a fixed 4), flagged
`'dead'` and drawn as a grayed portrait + skull condition icon — this *is* "carried
as bones." It is the simplest reading of §6.4 that fits the fixed 2×2 formation and
**serializes for free** (conditions are already saved as `string[]` in
`src/save/save.ts`). A dead member:

- takes no turns and earns no XP (already enforced by the `isDisabled` guard in
  `World.grantXp`),
- keeps their equipment and backpack — the gear travels with the body,
- can only be **resurrected** (clears `'dead'`) or **replaced** (slot overwritten)
  in town or at an altar.

> **Chosen interpretation:** no separate carriable "bones *Item*" is introduced.
> Making the corpse an inventory item would fight the fixed-4-slot roster and the
> formation-swap code, and complicate save/load for no player-facing gain.

---

## 3. Resurrect vs. Replace (the player's choice)

Both happen in the **Town Hub** (§5). For each dead slot the town offers:

- **Raise Dead** — pay gold scaled by the dead member's level (baseline
  `100 × level`). Clears `'dead'`, restores HP to half max, **keeps identity, gear,
  and XP**. A "resurrection penalty" hook (return at reduced max HP) is left as a
  tunable for the balance pass.
- **Replace** — pay a smaller recruit fee (or free). Opens the **existing party-
  creation flow** (`rollStats` / `cycleClass` / `createMember` in
  `src/data/creation.ts`) to roll a fresh level-1 adventurer, then overwrites that
  roster slot (`roster.members[i] = createMember(...)`, mirroring `beginParty()` in
  `src/main.ts`). The dead member's carried gear is dropped to the town floor/stash
  so nothing is lost.

Living members may also **rest for free** in town: full HP/MP, clears poison and
hunger. (Recruiting into an *empty* slot — party size > 4 — is out of scope.)

The **altar coexists**: it remains a rare, free, in-dungeon emergency revive of the
unconscious/dead in place; the town is the reliable, paid, always-available hub. The
existing altar behavior and its tests are untouched.

---

## 4. Town Portal spell

Added to `src/data/spells.ts` and handled in `World.cast`:

```ts
town_portal: { id: 'town_portal', name: 'Town Portal', mpCost: 6, castMs: 1200, kind: 'townPortal' }
```

- New `SpellKind` `'townPortal'` in `src/core/spell.ts`.
- New `case 'townPortal'` in `World.cast`: record a **recall anchor**
  `{ level, pos, facing }` from the current pose, then
  `changeLevel(TOWN_INDEX, TOWN_ENTRANCE)`. **Cannot be cast while a monster is
  hunting/attacking** — reuse the danger check from `World.camp()` — so it is never a
  combat escape hatch.
- **Return:** the town's return-portal cell (a `'townhub'` trigger, §5) calls a new
  `World.returnFromTown()` that `changeLevel`s back to the stored anchor (or emits a
  no-op message if no anchor is set — e.g. the party began in town).
- The anchor is a private field on `World`, added to `WorldSnapshot` and handled by
  `snapshot()` / `applySnapshot()` so it survives save/load.

Granted in the cleric/mage starting kit (`src/data/creation.ts`, `src/data/party.ts`)
so the spell is reachable in a fresh game.

---

## 5. Town Hub level

The town is **just another `Level`**, not a new UI mode — so movement, chrome, the
minimap, autosave-on-`changeLevel`, and save/load all work unchanged.

- **`src/data/maps/town.ts`** — a small hand-authored ASCII map (via `parseMap`, like
  `level2.ts`) with **no `spawns`** (safe zone). Appended to `dungeonMaps` in
  `src/data/maps/index.ts`; its array index is exported as `TOWN_INDEX`, with
  `TOWN_ENTRANCE` as the arrival pose.
- **New cell-trigger kind `'townhub'`** (extend the union in `src/core/triggers.ts` /
  the cell-trigger type in `src/core/dungeon.ts`), carrying a
  `service: 'raise' | 'recruit' | 'rest' | 'return'` tag. The map places four service
  cells: **raise-dead shrine**, **recruiter**, **rest point**, **return portal**.
- **`World.enterCell`** emits a `town/service { service }` event (core stays UI-free).
  Rest and return are handled entirely in core (`restInTown()`, `returnFromTown()`);
  raise and recruit emit the event, and the render layer opens the matching overlay
  which calls back into small core methods `World.raiseDead(i)` /
  `World.replaceMember(i, character)`.

---

## 6. Gold economy (minimal)

- `gold: number` on `Roster` (a party-shared purse) plus `Roster.earn(n)` and
  `Roster.spend(n): boolean`. Serialized in `src/save/save.ts` (`GameSave`).
- `MonsterSpecies` gains optional `gold?: [min, max]`; `World.killMonster` rolls it,
  adds it, and emits `party/gold { amount, total }` for the log.
- Town services check and spend gold; insufficient funds → declined with a message.

---

## 7. Implementation milestones (core-first, each ends green)

Ordered so the headless death model lands before any UI. Each ends with `npm test`
passing, and `tests/core/boundaries.test.ts` staying green (no `render`/`input`/
`audio` imports and no browser globals in new core files).

### M-DR1 — Permanent death in core (bleed-out to −10)
- `roster.ts`: `damage()` allows sub-0 HP for already-downed members; at `<= -10`
  add `'dead'`, remove `'unconscious'`, emit `char/died`. Add `bleed(dtMs, bus)`.
- `events.ts`: add `char/died`. `world.ts`: call `roster.bleed()` in `tick()`.
- **Tests:** 0 → unconscious (unchanged); damage to −10 → dead + `char/died`; bleed
  ticks kill an untouched unconscious member over N ticks; healing above 0 before
  −10 still wakes; `heal()` never clears `'dead'`.
- **Done when:** a downed member left alone dies; combat can kill outright past −10.

### M-DR2 — Gold purse + drops
- `roster.ts`: `gold` / `earn` / `spend`. `monster.ts` + `data/monsters.ts`: optional
  `gold`. `world.ts` `killMonster`: roll drop + emit `party/gold`. `save.ts`: persist
  gold. `events.ts`: `party/gold`.
- **Tests:** kills grant gold in range (seeded RNG); `spend` fails when short; gold
  round-trips through serialize/deserialize.

### M-DR3 — Town Portal spell + recall anchor
- `spell.ts`: `'townPortal'` kind. `data/spells.ts`: `town_portal`; grant in starting
  kits. `world.ts`: recall-anchor field, `cast` case (danger check), `returnFromTown`,
  extend `WorldSnapshot` + `snapshot`/`applySnapshot`.
- **Tests:** safe-cell cast sets anchor + moves to `TOWN_INDEX`; mid-fight cast
  refused; `returnFromTown` restores the exact pose; anchor survives snapshot;
  MP/cooldown spent only on success.

### M-DR4 — Town Hub level + services in core
- `data/maps/town.ts` (no spawns) + register in `maps/index.ts`; export `TOWN_INDEX`,
  `TOWN_ENTRANCE`. `triggers.ts`/`dungeon.ts`: `'townhub'` kind + `service` tag.
  `world.ts`: `enterCell` emits `town/service`; `raiseDead(i)`, `replaceMember(i, c)`,
  `restInTown()`; raise/recruit deduct gold and relocate the corpse's gear on replace.
  `events.ts`: `town/service`, `char/raised`, `char/replaced`.
- **Tests:** each service cell emits the right event; `raiseDead` clears `'dead'`,
  halves HP, spends gold, refuses when broke; `replaceMember` swaps in a built
  Character and moves the old gear; `restInTown` fully restores. A scripted run kills
  a member, portals to town, raises/replaces, and returns — all asserted.

### M-DR5 — Presentation (render/input)
- Town-service overlay (raise/recruit/rest/return) driven by `town/service`, reusing
  the creation-screen widgets (`render/createScreen.ts`) for Replace and the
  spell/inventory overlay patterns for menus. Party panel: skull icon + gray portrait
  for `'dead'`, distinct from dying/bleeding. Gold readout in chrome/party panel;
  `party/gold` logged. Route overlay actions to `world.raiseDead` / `replaceMember` /
  `returnFromTown`; add Town Portal to the spellbook cast list. Optionally consume
  `party/wiped` for a game-over screen.
- **Verify in-app** (preview MCP + `__world`/`__roster` DEV hooks): cast Town Portal,
  land in town, exercise raise vs. replace, confirm portrait/skull states, return to
  the recall point.

### M-DR6 — Content & balance pass
- Tune bleed rate, the −10 floor, raise/recruit costs, monster gold ranges, the
  optional resurrection penalty. Author the town map's look; add the game-over screen
  consuming `party/wiped`.

---

## 8. Out of scope
Party size other than 4; a carriable "bones Item"; multi-town / travel networks; a
full shop economy beyond raise/recruit; permadeath game-over polish beyond a basic
screen.

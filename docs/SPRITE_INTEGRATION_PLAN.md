# Sprite Integration Plan

Plan for wiring the new `assets/` PNG + JSON sprite sheets into the engine,
replacing the procedural programmer-art in the renderer. Written 2026-07-18
after auditing the assets and the render code. **Status: engine side (T0.3 +
Phases 1–5 wiring) implemented 2026-07-18; awaiting sourced art for Phase 0.
Atlases drop into `public/assets/` — see the README there.**

> **Decision (2026-07-18):** the AI-generated sheets in `assets/` are
> **concept art only** — no extraction pipeline. Scott will source real
> sprites separately. Phase 0 below is now the spec any incoming sprite pack
> must meet to drop into the loader.

---

## 1. Asset audit — what's actually in `assets/`

Four PNGs with JSON atlases: `walls/`, `monsters/`, `items/`, `ui/`, plus a
stray `assets/projectiles.json`.

### 1.1 Blocking problems

The sheets are AI-generated **reference/concept sheets**, not machine-readable
atlases. They cannot be consumed by a loader as-is:

1. **Dimensions don't match.** Every PNG is **2816×1536**; every JSON `meta`
   claims 1024×512 or 1024×1024. The JSON frame rectangles were authored
   against an imagined layout and do not correspond to where sprites sit in
   the real images.
2. **No transparency.** All four PNGs are fully opaque — the checkerboard
   "transparency" pattern is painted into the pixels (verified: zero pixels
   with alpha < 255). Monsters, items, portraits, and side-wall trapezoids
   all require real alpha.
3. **Not 1:1 pixel scale.** Sprites are painted as "fat pixel" art at roughly
   4–6× the target size (e.g. items that must be 16×16 are ~300px on the
   sheet). The engine integer-scales a 640×400 backbuffer, so art must be
   authored at true size. AI fat-pixels are also not on a uniform grid, so a
   naive downscale will produce mush; each sprite needs a cleanup pass.
4. **Sheets contain non-asset content** — title banners, section labels,
   perspective diagrams, palette guides, size annotations — interleaved with
   the sprites. The enemies block is duplicated across all four sheets.
5. **Two JSON files are invalid JSON.**
   - `walls/walls.json`: trailing comma after the last frame entry.
   - `projectiles.json`: a bare fragment (no `{ }`, no `meta`, no `frames`
     wrapper), and it references no image. There is **no projectile art on
     any sheet**.
6. **Internal inconsistencies.** `brick_side_0` claims 300×682 inside a
   canvas declared 1024×512; the walls sheet only shows brick fronts for rows
   1–3 at the labelled sizes plus fog variants that the JSON doesn't mention.

### 1.2 Coverage gaps vs. the game's actual content

| Category | Art provides | Game needs | Gap |
|---|---|---|---|
| Monsters | orc, goblin, skeleton (side/back walk, 3 tiers) | skeleton, kobold, giant_rat, cave_spider, zombie, wraith, bone_lord, ghoul, crypt_bat, necromancer | Only **skeleton** matches. Orc/goblin have no in-game species. |
| Walls | one style (brick), partial | 4 tilesets: brick, crypt, catacomb, sanctum ([tilesets.ts](../src/render/tilesets.ts)) | 3 tilesets have no art; brick set incomplete (no side trapezoids at all row sizes, no door). |
| Items | dagger, sword, bow, gold pile, food bundle, armor, jewels | short_sword, dagger, spear, leather_armor, wooden_shield, rations, potion_heal, iron_key, torch, gem, amulet_dawn, … ([items.ts](../src/data/items.ts)) | No potion, key, torch, spear, shield, amulet. |
| Portraits | 16 (4 races × 2 sexes × young/old) | `Character.portrait` is a bare number index | Fine — needs an index→name mapping table. |
| Projectiles | none (JSON fragment only) | dagger, bolt, stone at 11/8/6/4 px | All projectile art missing. |
| UI chrome | 4 framed 9-slice styles on the ui sheet; JSON describes only one 24×24 frame with 3px slices | 3 pane frames ([chrome.ts](../src/render/chrome.ts)) | Usable once extracted. |

**Conclusion:** there is a mandatory asset-preparation phase before any engine
work pays off. The engine work (Phases 1–6) is designed so it can proceed in
parallel using placeholder atlases, with per-sprite fallback to the existing
procedural art, so partial art coverage is never a blocker.

---

## 2. Phase 0 — Asset acquisition spec (no engine code)

The current sheets are shelved as concept art (suggest moving them to
`assets/concept/` so the loader's directories stay clean — needs Scott's OK).
Real sprites will be sourced externally. Any incoming pack must be normalized
to this spec before (or as part of) dropping it in:

- **T0.1 — Normalize to engine sizes** (from `docs/CREATING_SPRITES.md`):
  true 1× pixel scale, hard edges, PNG with real alpha, sweetie-16 palette
  (or a recolour pass). Targets: wall fronts 300/100/60/44 square + side
  trapezoids 682→300/300→100/100→60/60→44 (right-hand; engine mirrors left);
  monster tiers 128/82/52/36 tall; items 16×16; portraits 24×24;
  projectiles 11/8/6/4; UI 9-slice with 3px borders.
- **T0.2 — Pack atlases** — one PNG + JSON per category in `assets/`
  (`walls/`, `monsters/`, `items/`, `ui/`, `projectiles/`), JSON generated
  from the packer so coordinates are correct by construction. Naming:
  `<tileset>_<face>_<row>`, `<species>_<pose>_walk_tier<n>`, `item_<id>`,
  `portrait_<race>_<sex>_<age>`, `projectile_<kind>_tier<row>`. Delete or
  replace the current invalid JSONs (`walls.json` trailing comma,
  `projectiles.json` fragment) when the real ones land.
- **T0.3 — Atlas validation test** (vitest, node env — no DOM needed): every
  JSON parses, every frame rect is inside `meta.size`, no frame overlaps,
  animation strips have `w % frames === 0`. This test permanently guards the
  art pipeline and would have caught every problem in §1.1. Worth writing
  **now**, before any art arrives.

Because every draw site keeps its procedural fallback (Phases 2–5), the
engine work does **not** wait on Phase 0 — sprites light up category by
category as normalized atlases land.

## 3. Phase 1 — Atlas loader (`src/render/sprites.ts`)

The hook point the docs already promise.

- **T1.1 — Pure atlas module** (`src/render/atlas.ts`): types
  (`Frame { x, y, w, h, frames?, ms?, slice? }`), frame lookup, animation
  frame selection (`frameAt(frame, nowMs)`), 9-slice rectangle arithmetic.
  Pure functions → unit-testable in node, per the repo's core/render split.
- **T1.2 — Loader** (`src/render/sprites.ts`, browser-only): fetch JSON +
  load PNG per category, pre-bake horizontally-mirrored variants (left side
  walls, monster side poses) and tinted variants (hurt flash, portrait
  grey-out) into offscreen canvases at load time. API:
  `loadSprites(): Promise<Sprites>`, `sprites.has(name)`,
  `sprites.draw(ctx, name, x, y, w?, h?, opts?)`.
- **T1.3 — Async boot.** `main.ts` awaits `loadSprites()` before
  `startLoop()`, with a minimal "loading…" canvas state. A failed/missing
  atlas logs loudly and yields an empty sprite set — every draw site keeps
  its procedural fallback, so the game always runs.
- **T1.4 — Serving/build fix.** `assets/` is served in dev but is **not
  copied by `vite build`** (no `publicDir` config; default `public/` doesn't
  exist — `dist/` currently contains only compiled JS assets). Either move
  `assets/` → `public/assets/` or set `publicDir: 'assets'` in
  `vite.config.ts`. Recommendation: `public/assets/` (zero config surprise).

## 4. Phase 2 — Walls (`src/render/viewport.ts`)

- **T2.1 — Front faces.** `drawFrontFace()` draws `"<tileset>_front_<row>"`
  scaled into `frontRect()` (art is authored per-row at exact size, so this
  is 1:1 except row-0 clipping, which the existing clip rect already
  handles). Missing frame → current procedural fill.
- **T2.2 — Side faces.** `drawSideFace()` draws `"<tileset>_side_<row>"`
  (right-authored; mirrored variant for left) positioned on the quad's
  bounding box — the trapezoid shape comes from the sprite's alpha. Keep the
  procedural path for tilesets without art.
- **T2.3 — Doors stay procedural** for now (portcullis animation by
  `progress` works well); a sprite door is a later, separate task.

## 5. Phase 3 — Monsters

- **T3.1 — Species→sprite mapping.** Frame naming
  `<species>_<pose>_walk_tier<n>`; add a `spriteKey?` field to
  `MonsterSpecies` (only `skeleton` initially). `drawMonster()` picks pose
  from `m.facing` relative to the party (front/side/back; side mirrors for
  left), tier from the depth row, animation frame from `performance.now()`
  and the atlas `ms`. Hurt flash uses the pre-baked red-tinted variant.
- **T3.2 — Keep HP pip and hit-testing untouched** — `monsterBox()` already
  uses `MONSTER_H`, which matches the art tiers.
- **T3.3 — Fallback**: species without art keep the procedural blob+glyph, so
  the roster gap (§1.2) costs nothing.

## 6. Phase 4 — Items & projectiles

- **T4.1 — `drawItemIcon()`** tries frame `item_<tpl.id>` first, else current
  glyph rendering. Add an alias table for art-name mismatches
  (`item_sword` → `short_sword`, `item_bundle_of_food` → `rations`,
  `item_jewels` → `gem`, `item_gold_pile` → gold). Sizes 16 → 14/11/8 via
  scaled `drawImage` (smoothing already off globally).
- **T4.2 — `drawProjectile()`** maps projectile kind → `projectile_<kind>_tier<row>`,
  fallback to the current square+glyph.

## 7. Phase 5 — UI: portraits & chrome

- **T5.1 — Portraits.** Index→frame table for the 16 portraits
  (`PORTRAITS[portrait % 16]`); `partyPanel.ts` draws the 24×24 sprite in the
  26px card box, pre-baked greyscale variant when down. Creation screen
  (`createScreen.ts` / `creation.ts`) lets the portrait index cycle through
  all 16.
- **T5.2 — Chrome 9-slice.** `chrome.ts` replaces the bevel with the 9-slice
  frame using `slice_*` metadata (pure slice-rect math from T1.1, tested).
  Content-well geometry (`BORDER = 3`) is unchanged, so no layout ripple.

## 8. Phase 6 — Verification & polish

- **T6.1 — Unit tests** (vitest, node): atlas validation (T0.4), frame
  animation math, 9-slice rects, portrait/item mapping tables, species
  sprite-key resolution. Draw functions stay untested-in-node as today
  (canvas), which is why all logic lives in pure modules.
- **T6.2 — In-browser verification** of every touched screen (dungeon view
  near/far walls + corners, monsters at all 4 rows, floor items, thrown
  dagger, party panel, inventory, creation, town) plus a `vite build` +
  preview to confirm assets ship in `dist/`.
- **T6.3 — Docs.** Update `CREATING_SPRITES.md` §7 status note (loader now
  exists), document the atlas packer workflow.

---

## 9. Suggested order & sizing

| Step | Depends on | Size |
|---|---|---|
| T0.3 atlas validation test | — | Small — write first |
| P1 loader (T1.1–T1.4) | — | Medium |
| P4 items+projectiles wiring | P1 | Small — lights up when item art lands |
| P5 portraits+chrome wiring | P1 | Small |
| P3 monsters wiring | P1 | Medium |
| P2 walls wiring | P1 | Medium — hardest to get looking right |
| P0 sprite sourcing | — (Scott, parallel) | External |

All engine work proceeds now against the fallback path; each category
switches from procedural to sprites the moment its normalized atlas lands in
`assets/`.

## 10. Open questions — resolved 2026-07-18

1. **Asset route:** the AI sheets are shelved as concept art; Scott is
   sourcing sprites elsewhere. Phase 0 is now the drop-in spec.
2. **Orc & goblin art:** shelved with the sheets.
3. **Non-brick tilesets:** stay procedural until sourced art exists; the
   loader's per-tileset frame lookup means extra tilesets are pure content.
4. **Missing item icons:** glyph fallback until art exists.

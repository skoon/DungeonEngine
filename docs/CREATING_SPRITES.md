# Creating Sprites for the Dungeon Engine

A practical art guide: exact pixel sizes, how to make wall textures read correctly
in the first-person view, and how animation works.

> **Status note (read this first).** Today the engine draws walls, monsters,
> items, and UI as **procedural programmer-art** (shaded polygons + glyphs), not
> PNGs. The PNG sprite pipeline (`src/render/sprites.ts`, an atlas loader) is the
> planned art-integration hook — it's part of the ongoing M10 art pass and isn't
> wired yet. This guide tells you **exactly what to draw** so your art drops in
> cleanly when that loader lands, and it points at the specific draw functions
> each sprite replaces. Every size below is computed from the engine's real
> projection constants, so art authored to these numbers renders 1:1 with no
> scaling mush.

---

## 0. Size cheat-sheet (TL;DR)

Everything is drawn into a fixed **640 × 400** backbuffer that is then
*integer-scaled* (×2, ×3, …) with smoothing **off**. So: design at 1×, one art
pixel = one game pixel, hard edges, no anti-aliasing.

| Asset | Size(s) | Notes |
|---|---|---|
| **Wall — front face** | 300, 100, 60, 44 px **square**, per depth row (0→3) | Row 0 = adjacent wall, fills the view |
| **Wall — side face** | Trapezoids, near→far height: 682→300, 300→100, 100→60, 60→44 | Author the **right** side; left is mirrored |
| **Monster billboard** | height 128 / 82 / 52 / 36 px (rows 0–3), width ≈ 0.55 × height | Transparent background |
| **Item icon** | **16 × 16** | Transparent; also drawn ~14/11/8 on the floor |
| **Character portrait** | **24 × 24** (sits in a 26 px card box) | |
| **Projectile** | 11 / 8 / 6 / 4 px (rows 0–3) | Dagger, bolt, stone |
| **UI chrome** | 9-slice, ~3 px borders | Pane frames |
| **Canvas / screen** | 640 × 400 | The whole game |
| **Viewport pane (the 3D view)** | 440 × 290 (content well ≈ 430 × 280) | Where walls/monsters draw |

The three panes: **viewport** `440×290` (top-left), **message log** `440×110`
(below it), **party** `200×400` (right).

---

## 1. Pixel-art rules (non-negotiable)

- **Work at 1×.** The backbuffer is 640×400; it scales up as a whole, so a 16px
  icon is genuinely 16 pixels. Never pre-scale your art.
- **No anti-aliasing.** `imageSmoothingEnabled = false`. Soft/blurry edges will
  look wrong. Use hard 1px edges and dithering, not gradients.
- **Stay in the palette** (§2). The whole game shares one 16-colour palette so
  new art doesn't clash.
- **Transparency:** billboards (monsters), items, and icons need a **transparent
  background** (PNG with alpha). Walls are **opaque** — they're solid fills.
- **One light source.** Pick a direction (top-left is the engine's convention)
  and keep it consistent across every sprite.
- **Export:** PNG, RGBA (or indexed + alpha). Aseprite, Piskel, or GIMP all work.

---

## 2. The palette (sweetie-16)

The engine draws from these 16 colours only (`src/render/palette.ts`). Load this
as your palette in your editor and paint within it.

```
black  #1a1c2c    purple #5d275d    red    #b13e53    orange #ef7d57
yellow #ffcd75    lime   #a7f070    green  #38b764    teal   #257179
navy   #29366f    blue   #3b5dc9    azure  #41a6f6    cyan   #73eff7
white  #f4f4f4    gray   #94b0c2    slate  #566c86    ink    #333c57
```

**Depth fog uses the palette, not alpha.** Near walls use lighter stone
(gray/slate); far walls use darker (ink/navy). If you author one tile, provide 2
darker variants for the mid/far rows; if you author per-row (recommended), just
paint each row's tile a step darker. See how the two tilesets pick their ramps in
`src/render/tilesets.ts`.

---

## 3. Wall textures — the hard part

### 3.1 How the first-person view is built

There is **no raycasting and no live texture-warping.** Like *Eye of the
Beholder*, the view is a painter's-algorithm stack of **pre-drawn, already-in-
perspective sprites**, one per frustum slot. The camera sees a 4-row-deep
trapezoid of cells:

```
row 3 (far):   [-3][-2][-1][ 0][+1][+2][+3]
row 2:             [-2][-1][ 0][+1][+2]
row 1:                 [-1][ 0][+1]
row 0 (near):          [-1][ 0][+1]      <- you stand in row 0
```

Each cell has up to three visible wall faces: a **front face** (flat, facing you)
and two **side faces** (receding left/right). The engine computes each slot's
on-screen rectangle from a pinhole projection (`scale = FOCAL / Z`, with
`FOCAL = 150`, horizon at y≈134, centre line at x=220). Your job is to draw the
wall **already foreshortened to fit those rectangles**.

### 3.2 Front faces — exact sizes

A front face is a **square**, `scale × scale`, centred on the depth. Author one
sprite per depth row (they get smaller and darker with distance):

| Depth row | Size | When you see it |
|---|---|---|
| 0 (adjacent) | **300 × 300** (clips to the ~280-tall view) | A wall one step in front of you |
| 1 | **100 × 100** | Two cells ahead |
| 2 | **60 × 60** | Three cells ahead |
| 3 | **44 × 44** | Four cells ahead (the far wall) |

Off-centre cells (`lat = ±1, ±2, ±3`) use the **same** front-face sprite, just
positioned left/right. So you only need **one front sprite per row**, not per
lateral position.

### 3.3 Side faces — trapezoids

Side faces recede toward the vanishing point, so they're **trapezoids**: a tall
near edge and a short far edge.

| Depth row | Near edge height → far edge height |
|---|---|
| 0 | 682 → 300 (near edge runs off the screen edge) |
| 1 | 300 → 100 |
| 2 | 100 → 60 |
| 3 | 60 → 44 |

Author only the **right-hand** side wall; the engine mirrors it for the left.
That's why a full "brick" set is only ~**7 sprites**: 3–4 front tiles + 3–4 side
trapezoids. (Row 0's side edge is mostly off-screen, so you can often skip it.)

### 3.4 Making walls "look right"

This is where most of the craft lives:

1. **Courses must converge.** On a side-face trapezoid, the horizontal brick
   courses have to angle toward the vanishing point (screen centre, y≈134). Draw
   them shorter and closer together toward the far (short) edge. If your courses
   stay parallel, the wall looks like a flat billboard, not a receding surface.
2. **Tile seamlessly at cell edges.** The **right edge of a front tile must line
   up with the left edge** of the next cell's front tile, or long corridors show
   seams. Use a running-bond pattern that continues cleanly across the boundary,
   and keep the brick grid aligned to the tile edges.
3. **Match texel density across depth.** A brick should occupy roughly the same
   *fraction* of the wall at every distance, so near and far walls read as the
   same material. If you author per-row sprites, scale the brick pattern down for
   each smaller tile (e.g. ~5 courses on the 100px tile → ~3 on the 60px tile).
4. **Bake the fog in.** Paint row 0 in gray/slate, row 1 slate, row 2 ink, row 3
   navy (or your tileset's ramp). The darkening is what sells distance.
5. **Keep the corner where front meets side crisp.** A 1px darker seam
   (black/ink mortar) at the front/side boundary reads as a wall corner.
6. **Consistent light.** Top-lit is the convention — top course a shade lighter,
   bottom a shade darker.

### 3.5 Where this plugs into the code

Front faces are drawn by `drawFrontFace()` and sides by `drawSideFace()` in
`src/render/viewport.ts` (currently solid fill + procedural mortar). A PNG
pipeline swaps those fills for `ctx.drawImage(atlas, …)` at the exact rectangles
the geometry table already produces (`frontRect()` / `sideQuad()` in
`src/render/viewGeometry.ts`). Doors reuse the front-face slot (`drawFrontDoor`).

### 3.6 The simpler alternative (one flat tile)

If per-perspective art is too much, author **one square 64×64 tile per wall
style** and add a small code change so the engine scales it into each front rect
and skews it into each side quad via `ctx.setTransform`/`drawImage`. You lose
some fidelity (auto-scaled foreshortening never looks as good as hand-drawn) but
you draw far fewer sprites. This path needs an engine tweak; the pre-perspective
atlas (§3.2–3.3) is what the design targets.

---

## 4. Monsters & billboards

Monsters are **billboards**: flat sprites standing on the cell floor, scaled by
distance. Author with a **transparent background**.

**Sizes** (`MONSTER_H` in `viewport.ts`, indexed by depth row):

| Depth row | Height × Width |
|---|---|
| 0 (adjacent) | 128 × 70 |
| 1 | 82 × 45 |
| 2 | 52 × 29 |
| 3 | 36 × 20 |

Two ways to supply these:
- **One large sprite (~128 tall), downscaled** by the engine — simplest, slightly
  soft when shrunk.
- **Three scale tiers** (near/mid/far, ~82 / 52 / 36 tall) — crisper, more work.
  This is what the design calls for (§4.4 of the plan).

**Poses:** author **front / side / back** facing (the engine picks by the
monster's facing relative to the party). Anchor the sprite at the **feet**
(bottom-centre sits on the floor). Include a small **idle bob** and, if you want,
a **2-frame walk** and a **2-frame attack** (see §7). The hurt-flash (red tint on
hit) is done in code — you don't need a "hurt" frame.

Drawn by `drawMonster()` in `viewport.ts`.

---

## 5. Items, portraits, projectiles, UI

- **Item icons — 16 × 16, transparent.** Used in hand slots, the inventory grid,
  and on the dungeon floor (auto-scaled to ~14/11/8 for the three nearest rows).
  Keep the silhouette readable at 8px. Drawn by `drawItemIcon()`
  (`src/render/itemIcon.ts`).
- **Portraits — 24 × 24, transparent.** They sit in a 26px card box on the party
  panel (`partyPanel.ts`). Design them to gray out gracefully — the engine dims
  them when a character is downed.
- **Projectiles — tiny, 11/8/6/4 px** by row. A dagger, a magic bolt, a sling
  stone. Transparent. Drawn by `drawProjectile()`.
- **UI chrome — 9-slice.** Pane frames use a ~3px stone border (corners + edges +
  centre). Author a 9-slice sheet (e.g. a 24×24 frame with 3px slices) to replace
  the procedural bevel in `src/render/chrome.ts`.
- **Floor markers** (pressure plates, teleporters, pits, the altar) are drawn on
  the floor per cell; if you sprite them, size them to the cell's floor quad
  (roughly the front-face width for that row).

---

## 6. Animated sprites — yes

Animation is fully supported. Rendering runs every frame (~60fps via
`requestAnimationFrame`), **independently of the 100ms simulation tick**, so
animation is smooth and you time it in wall-clock milliseconds.

### 6.1 How to author animation

- Lay frames out as a **horizontal strip** (frame 0, 1, 2, … left to right), each
  frame the tier size (e.g. a 2-frame 82px walk = an 164×82 strip).
- Keep frame counts small (**2–4 frames**) — it keeps the atlas tiny and reads as
  authentically retro.
- Suggested timing: idle/walk **~150–250 ms per frame**; attack a snappy 2-frame
  at ~80–120 ms.

### 6.2 How the engine advances frames

Pick a frame in the draw call from a timer, e.g.:

```ts
const frame = Math.floor(performance.now() / 200) % FRAME_COUNT; // 200ms/frame
```

For state-driven animation (walk vs. attack), branch on the monster's `state`
(`hunt`/`attack`) which the AI already sets, and on its per-monster timers.

### 6.3 What animates in the engine

- **Monsters** — idle bob, walk, attack (frame sheets, as above).
- **Doors** — slide open/closed. Already animated *procedurally* via
  `door.progress` (advanced each `World.tick`); a sprite door would sample frames
  by `progress` instead.
- **Projectiles** — hop cell-to-cell (`hopMs`); add a 2-frame spin if you like.
- **Torches / braziers / water / pit shimmer** — decorative loopers; a 2–4 frame
  strip on a wall or floor marker.
- **Spell effects** — short one-shot strips (burst, cone), played then discarded.

Flash/tint overlays (hurt, heal, damage-flash on party cards) are done in code —
don't author frames for those.

---

## 7. Files, atlases, and where they go

- Put source sheets in **`assets/`** (`assets/walls/`, `assets/monsters/`,
  `assets/items/`, `assets/ui/`). The build serves them statically.
- Export each **sprite sheet as one PNG** plus a **JSON atlas** mapping names to
  rectangles (Aseprite exports both together). Suggested atlas entry:

```json
{
  "brick_front_1": { "x": 0,   "y": 0, "w": 100, "h": 100 },
  "brick_side_1":  { "x": 100, "y": 0, "w": 100, "h": 100 },
  "skeleton_walk": { "x": 0, "y": 0, "w": 164, "h": 82, "frames": 2, "ms": 200 }
}
```

- **Naming:** `<tileset>_<face>_<row>` for walls (`brick_front_1`,
  `crypt_side_2`), `<species>_<pose>_<anim>` for monsters
  (`skeleton_front_walk`), `<id>` for items (`short_sword`).
- The atlas loader (`src/render/sprites.ts`, to be added) will `await` the PNGs,
  slice them per the JSON, mirror right→left side walls at load, and hand named
  sub-images to the draw functions.

---

## 8. Workflow checklist

1. Load the **sweetie-16 palette** (§2) in your editor; set canvas to the target
   size (§0); turn **off** anti-aliasing.
2. Walls: draw the **front** tiles (300/100/60/44) then the **right side**
   trapezoids (§3.2–3.3). Verify courses converge and tiles seam cleanly.
3. Darken each row a step for fog.
4. Monsters/items: draw on **transparent** backgrounds at the tier sizes,
   anchored at the feet (monsters) / centred (items).
5. Animations: horizontal strips, 2–4 frames, note ms/frame in the atlas.
6. Export **PNG + JSON** into `assets/`, name per §7.
7. Drop them in when the atlas loader lands — the draw functions in
   `viewport.ts` / `itemIcon.ts` are already sized to your art.

Happy pixel-pushing. Keep the palette tight and the edges hard, and it'll feel
like 1991 in the best way.

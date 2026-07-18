# Sprite atlases (drop-in point)

Real sprite art goes here. Everything under `public/` is served as-is in dev
and copied into `dist/` by `vite build`, so these paths are stable URLs.

The loader (`src/render/sprites.ts`) looks for exactly these atlases:

```
assets/walls/walls.json            + the PNG it names
assets/monsters/monsters.json      + PNG
assets/items/items.json            + PNG
assets/ui/frames.json              + PNG
assets/projectiles/projectiles.json + PNG
```

Missing atlases are fine — the engine keeps its procedural art per category.
A malformed atlas is rejected with a console.error explaining why.

Requirements for incoming art (full spec: `docs/SPRITE_INTEGRATION_PLAN.md`
§2 and `docs/CREATING_SPRITES.md`):

- True 1× pixel scale, hard edges, PNG with real alpha, sweetie-16 palette.
- Atlas JSON: `{ "meta": { "image": "<file>.png", "size": { "w": _, "h": _ } },
  "frames": { "<name>": { "x": _, "y": _, "w": _, "h": _ } } }`.
  Animation strips add `"frames": N, "ms": <per-frame>`; `w` is the total
  strip width. 9-slice frames add `slice_top/bottom/left/right`.
- Naming: `<tileset>_front_<row>` / `<tileset>_side_<row>` (rows 0–3, side
  authored facing right), `<species>_<pose>_walk_tier<row>` (pose front|side|back),
  `item_<templateId>`, `portrait_<race>_<sex>_<age>`,
  `projectile_<label_slug>_tier<row>`, `ui_chrome_frame`.

`tests/render/atlasFiles.test.ts` validates every JSON in this tree — run
`npm test` after dropping art in.

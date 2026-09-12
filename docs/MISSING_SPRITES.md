# Missing sprite inventory

Updated 2026-09-12 from the live registries and renderer. The reddish-brown
`brick` hallway atlas is now present in `public/assets/walls/`. Skeleton and
kobold art are now present in `public/assets/monsters/`; everything else below still falls back to
procedural art or glyphs.

## Monsters (highest priority)

Each species needs front, side, and back walk art at tiers 0–3. Side art is
authored facing right and mirrored by the engine. A complete species is 12
atlas frames (animation strips may contain 2–4 frames).

- [x] `skeleton`
- [x] `kobold`
- `giant_rat`
- `cave_spider`
- `zombie`
- `wraith`
- `bone_lord` (boss)
- `ghoul`
- `crypt_bat`
- `necromancer`
- `stone_golem`
- `lich` (final boss)

After a species atlas lands, its `MonsterSpecies.spriteKey` in
`src/data/monsters.ts` must be set to the matching sprite family name.

## Remaining environment art

- [x] Wall atlases for `crypt`, `catacomb`, and `sanctum`, front and right-side
  faces at depth rows 0–3.
- Animated portcullis/door art for all four wall sets. Doors currently stay
  procedural even when wall sprites are present.
- Floor markers: `pit`, `plate`, `teleporter`, `altar`, `stairs`, and
  `victory` (the dawn seal).
- Wall details: button, lever, alcove, wall inscription, detected secret-door
  hint, and illusion shimmer.

## Items

Each item needs one transparent 16×16 frame named for `itemFrame()`:

- `item_sword` (`short_sword` alias)
- `item_dagger`
- `item_spear`
- `item_armor` (`leather_armor` alias)
- `item_wooden_shield`
- `item_bundle_of_food` (`rations` alias)
- `item_potion_heal`
- `item_iron_key`
- `item_torch`
- `item_jewels` (`gem` alias)
- `item_amulet_dawn`

## Projectiles and spell effects

Projectile frames are needed at tiers 0–3 for:

- `projectile_dagger_tierN`
- `projectile_magic_missile_tierN`
- `projectile_chill_bolt_tierN`
- `projectile_shadow_bolt_tierN`
- `projectile_soul_bolt_tierN`

There is no atlas hook yet for the non-projectile spell effects: Burning
Hands, Shield, Cure Wounds, Light, Detect Secret, and Town Portal.

## Portraits and UI

- 16 transparent 24×24 portraits: human, elf, dwarf, and halfling; male and
  female; young and old (`PORTRAIT_FRAMES` in `src/render/spriteKeys.ts`).
- `ui_chrome_frame`, a 9-slice panel frame with 3px borders.

## Suggested production order

1. Skeleton, kobold, giant rat, and cave spider (early-game encounters).
2. Zombie, wraith, bone lord, ghoul, and crypt bat.
3. Necromancer, stone golem, and lich.
4. The 11 item icons and five projectile families.
5. Doors and environmental details.
6. Portraits, UI chrome, and optional spell-effect polish.

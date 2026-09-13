# Missing sprite inventory

Updated 2026-09-12 from the live registries and renderer. The reddish-brown
`brick` hallway atlas is now present in `public/assets/walls/`. All currently
tracked monster, environment, item, projectile, portrait, and UI atlases are
now present under `public/assets/`.

## Monsters (highest priority)

Each species needs front, side, and back walk art at tiers 0–3. Side art is
authored facing right and mirrored by the engine. A complete species is 12
atlas frames (animation strips may contain 2–4 frames).

- [x] `skeleton`
- [x] `kobold`
- [x] `giant_rat`
- [x] `cave_spider`
- [x] `zombie`
- [x] `wraith`
- [x] `bone_lord` (boss)
- [x] `ghoul`
- [x] `crypt_bat`
- [x] `necromancer`
- [x] `stone_golem`
- [x] `lich` (final boss)

After a species atlas lands, its `MonsterSpecies.spriteKey` in
`src/data/monsters.ts` must be set to the matching sprite family name.

## Environment art

- [x] Wall atlases for `crypt`, `catacomb`, and `sanctum`, front and right-side
  faces at depth rows 0–3.
- [x] Portcullis/door art for all four wall sets.
- [x] Floor markers: `pit`, `plate`, `teleporter`, `altar`, `stairs`, and
  `victory` (the dawn seal).
- [x] Wall details: button, lever, alcove, wall inscription, detected
  secret-door hint, and illusion shimmer.

## Items

Each item needs one transparent 16×16 frame named for `itemFrame()`:

- [x] `item_sword` (`short_sword` alias)
- [x] `item_dagger`
- [x] `item_spear`
- [x] `item_armor` (`leather_armor` alias)
- [x] `item_wooden_shield`
- [x] `item_bundle_of_food` (`rations` alias)
- [x] `item_potion_heal`
- [x] `item_iron_key`
- [x] `item_torch`
- [x] `item_jewels` (`gem` alias)
- [x] `item_amulet_dawn`

## Projectiles and spell effects

Projectile frames are needed at tiers 0–3 for:

- [x] `projectile_dagger_tierN`
- [x] `projectile_magic_missile_tierN`
- [x] `projectile_chill_bolt_tierN`
- [x] `projectile_shadow_bolt_tierN`
- [x] `projectile_soul_bolt_tierN`

There is no atlas hook yet for the non-projectile spell effects: Burning
Hands, Shield, Cure Wounds, Light, Detect Secret, and Town Portal.

## Portraits and UI

- [x] 16 transparent 24×24 portraits: human, elf, dwarf, and halfling; male and
  female; young and old (`PORTRAIT_FRAMES` in `src/render/spriteKeys.ts`).
- [x] `ui_chrome_frame`, a 9-slice panel frame with 3px borders.

## Suggested production order

1. Skeleton, kobold, giant rat, and cave spider (early-game encounters).
2. Zombie, wraith, bone lord, ghoul, and crypt bat.
3. Necromancer, stone golem, and lich.
4. The 11 item icons and five projectile families.
5. Doors and environmental details.
6. Portraits, UI chrome, and optional spell-effect polish.

import { describe, expect, it } from 'vitest';
import { Dir } from '@/core/grid';
import {
  PORTRAIT_FRAMES,
  itemFrame,
  monsterFrame,
  monsterPose,
  portraitFrame,
  projectileFrame,
  wallFrontFrame,
  wallSideFrame,
} from '@/render/spriteKeys';

describe('item frame names', () => {
  it('defaults to item_<id>', () => {
    expect(itemFrame('dagger')).toBe('item_dagger');
    expect(itemFrame('iron_key')).toBe('item_iron_key');
  });

  it('applies aliases where art names differ from template ids', () => {
    expect(itemFrame('short_sword')).toBe('item_sword');
    expect(itemFrame('rations')).toBe('item_bundle_of_food');
    expect(itemFrame('gem')).toBe('item_jewels');
  });
});

describe('projectile frame names', () => {
  it('slugs the combat label and appends the depth tier', () => {
    expect(projectileFrame('Dagger', 2)).toBe('projectile_dagger_tier2');
    expect(projectileFrame('Magic Missile', 0)).toBe('projectile_magic_missile_tier0');
  });
});

describe('portrait frames', () => {
  it('exposes 16 unique names', () => {
    expect(PORTRAIT_FRAMES).toHaveLength(16);
    expect(new Set(PORTRAIT_FRAMES).size).toBe(16);
    expect(PORTRAIT_FRAMES[0]).toBe('portrait_human_m_young');
  });

  it('wraps any index into range', () => {
    expect(portraitFrame(0)).toBe(PORTRAIT_FRAMES[0]);
    expect(portraitFrame(16)).toBe(PORTRAIT_FRAMES[0]);
    expect(portraitFrame(21)).toBe(PORTRAIT_FRAMES[5]);
    expect(portraitFrame(-1)).toBe(PORTRAIT_FRAMES[15]);
  });
});

describe('monster pose selection', () => {
  it('shows the back of a monster facing away from the party', () => {
    expect(monsterPose(Dir.N, Dir.N)).toEqual({ pose: 'back', mirror: false });
  });

  it('shows the front of a monster facing the party', () => {
    expect(monsterPose(Dir.S, Dir.N)).toEqual({ pose: 'front', mirror: false });
  });

  it("side pose mirrors when the monster faces the viewer's left", () => {
    // Party looks North: a monster facing East walks to the viewer's right.
    expect(monsterPose(Dir.E, Dir.N)).toEqual({ pose: 'side', mirror: false });
    // Facing West walks to the viewer's left → mirrored sprite.
    expect(monsterPose(Dir.W, Dir.N)).toEqual({ pose: 'side', mirror: true });
  });

  it('is relative to the party facing, not absolute', () => {
    expect(monsterPose(Dir.W, Dir.E)).toEqual({ pose: 'front', mirror: false });
    expect(monsterPose(Dir.N, Dir.E)).toEqual({ pose: 'side', mirror: true });
  });
});

describe('frame name builders', () => {
  it('builds monster and wall frame names per the naming spec', () => {
    expect(monsterFrame('skeleton', 'side', 1)).toBe('skeleton_side_walk_tier1');
    expect(wallFrontFrame('brick', 0)).toBe('brick_front_0');
    expect(wallSideFrame('crypt', 3)).toBe('crypt_side_3');
  });
});

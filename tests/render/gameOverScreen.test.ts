import { describe, expect, it } from 'vitest';
import { buildGameOverItems, hitGameOver } from '@/render/gameOverScreen';

describe('game-over screen (M11)', () => {
  it('offers Load only when a save exists', () => {
    const withSave = buildGameOverItems(true);
    expect(withSave.map((i) => i.id)).toEqual(['load', 'title']);
    expect(withSave[0]!.enabled).toBe(true);

    const noSave = buildGameOverItems(false);
    expect(noSave[0]!.enabled).toBe(false); // Load disabled
    expect(noSave[1]!.enabled).toBe(true); // Return to Title always available
  });

  it('hit-tests only enabled items', () => {
    const items = buildGameOverItems(false); // Load disabled
    const load = items[0]!.rect;
    const title = items[1]!.rect;
    // A click on the disabled Load row finds nothing.
    expect(hitGameOver(items, load.x + 4, load.y + 4)).toBe(-1);
    // A click on the enabled Title row finds it.
    expect(hitGameOver(items, title.x + 4, title.y + 4)).toBe(1);
  });
});

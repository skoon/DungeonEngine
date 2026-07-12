import { describe, expect, it } from 'vitest';
import { buildVictoryItems, hitVictory } from '@/render/victoryScreen';

describe('victory screen (M14)', () => {
  it('offers Continue Exploring and Return to Title, both enabled', () => {
    const items = buildVictoryItems();
    expect(items.map((i) => i.id)).toEqual(['continue', 'title']);
    expect(items.every((i) => i.enabled)).toBe(true);
  });

  it('hit-tests the rows', () => {
    const items = buildVictoryItems();
    const cont = items[0]!.rect;
    const title = items[1]!.rect;
    expect(hitVictory(items, cont.x + 4, cont.y + 4)).toBe(0);
    expect(hitVictory(items, title.x + 4, title.y + 4)).toBe(1);
    expect(hitVictory(items, 0, 0)).toBe(-1);
  });
});

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { type AtlasDoc, validateAtlas } from '@/render/atlas';

/**
 * Guards the art pipeline (sprite plan T0.3): every atlas JSON that ships in
 * public/assets must parse and pass structural validation, so bad drops are
 * caught by `npm test` instead of a silent console.error at runtime.
 */

const ASSETS_DIR = join(__dirname, '..', '..', 'public', 'assets');

function jsonFilesUnder(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...jsonFilesUnder(full));
    else if (entry.endsWith('.json')) out.push(full);
  }
  return out;
}

describe('shipped atlas files', () => {
  const files = jsonFilesUnder(ASSETS_DIR);

  it('validates every atlas JSON under public/assets', () => {
    // No atlases yet is a valid state — art lands category by category.
    for (const file of files) {
      let doc: AtlasDoc;
      try {
        doc = JSON.parse(readFileSync(file, 'utf8')) as AtlasDoc;
      } catch (e) {
        throw new Error(`${file}: invalid JSON — ${String(e)}`);
      }
      expect(validateAtlas(doc, file)).toEqual([]);
    }
  });

  it('each atlas sits next to the image it names', () => {
    for (const file of files) {
      const doc = JSON.parse(readFileSync(file, 'utf8')) as AtlasDoc;
      const image = join(file, '..', doc.meta.image);
      expect(existsSync(image), `${file} names missing image ${doc.meta.image}`).toBe(true);
    }
  });
});

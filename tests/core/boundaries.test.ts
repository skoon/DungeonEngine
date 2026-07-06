/**
 * Architectural guard: src/core must stay headless — no imports from the
 * presentation layers and no browser globals. This is what keeps the whole
 * simulation unit-testable and save/load trivial (plan §1).
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// This test lives in tests/core/ but audits the real source in src/core/.
const CORE_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../src/core');
const FORBIDDEN_IMPORTS = ['/render/', '/input/', '/audio/', '../render', '../input', '../audio'];
const FORBIDDEN_GLOBALS = /\b(window|document|requestAnimationFrame|HTMLElement|localStorage)\b/;

const coreFiles = readdirSync(CORE_DIR).filter(
  (f) => f.endsWith('.ts') && !f.endsWith('.test.ts'),
);

describe('core import boundaries', () => {
  it('finds core source files', () => {
    expect(coreFiles.length).toBeGreaterThan(0);
  });

  it.each(coreFiles)('%s has no presentation imports or browser globals', (file) => {
    const source = readFileSync(join(CORE_DIR, file), 'utf8');
    for (const forbidden of FORBIDDEN_IMPORTS) {
      expect(source, `${file} imports from a presentation layer`).not.toContain(
        `from '${forbidden}`,
      );
      expect(source).not.toContain(`from "..${forbidden}`);
    }
    expect(source, `${file} references a browser global`).not.toMatch(FORBIDDEN_GLOBALS);
  });
});

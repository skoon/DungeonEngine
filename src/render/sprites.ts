/**
 * Sprite atlas loader + draw surface (sprite plan P1/T1.2). Browser-only:
 * this module owns fetch/Image/canvas work, while all data rules live in the
 * pure `atlas.ts` / `spriteKeys.ts` modules so they stay node-testable.
 *
 * Loading is fire-and-forget and per-atlas tolerant: a missing atlas is an
 * expected state (art arrives category by category — plan §2) and simply
 * leaves that category on procedural art, while a *malformed* atlas is
 * rejected loudly via console.error. Draw sites call `sprites.draw(...)` and
 * fall back to programmer-art when it returns false, so the game always
 * renders regardless of which atlases exist.
 *
 * Module top level must stay DOM-free: node-side vitest suites import render
 * modules that import this one.
 */

import {
  type AtlasDoc,
  type FrameDef,
  frameIndex,
  frameSrcRect,
  frameWidth,
  nineSliceRects,
  validateAtlas,
} from './atlas';

/** Atlas manifest — one JSON per category under `public/assets/`. */
const ATLAS_URLS = [
  'assets/walls/walls.json',
  'assets/monsters/monsters.json',
  'assets/items/items.json',
  'assets/ui/frames.json',
  'assets/projectiles/projectiles.json',
];

export interface DrawOpts {
  /** Flip horizontally (left side walls, monsters walking left). */
  mirror?: boolean;
  /** Replace opaque pixels with this colour (hurt flash). */
  tint?: string;
  /** Desaturate (downed-character portraits). */
  grayscale?: boolean;
  /** Animation clock override; defaults to performance.now(). */
  now?: number;
}

interface LoadedFrame {
  def: FrameDef;
  sheet: HTMLImageElement;
}

class SpriteStore {
  private readonly frames = new Map<string, LoadedFrame>();
  /** Baked tint/grayscale strips, keyed by frame name + variant. */
  private readonly variants = new Map<string, HTMLCanvasElement>();

  get count(): number {
    return this.frames.size;
  }

  has(name: string): boolean {
    return this.frames.has(name);
  }

  frame(name: string): FrameDef | undefined {
    return this.frames.get(name)?.def;
  }

  register(doc: AtlasDoc, sheet: HTMLImageElement, label: string): void {
    for (const [name, def] of Object.entries(doc.frames)) {
      if (this.frames.has(name)) {
        console.error(`[sprites] ${label}: duplicate frame name "${name}" — keeping the first`);
        continue;
      }
      this.frames.set(name, { def, sheet });
    }
  }

  /**
   * Draw frame `name` with its top-left at (x, y), scaled to w×h (defaults
   * to the frame's own size). Returns false when the frame doesn't exist so
   * the call site can draw its procedural fallback instead.
   */
  draw(
    ctx: CanvasRenderingContext2D,
    name: string,
    x: number,
    y: number,
    w?: number,
    h?: number,
    opts: DrawOpts = {},
  ): boolean {
    const entry = this.frames.get(name);
    if (!entry) return false;
    const { def } = entry;

    const idx = frameIndex(def, opts.now ?? performance.now());
    const dw = Math.round(w ?? frameWidth(def));
    const dh = Math.round(h ?? def.h);
    if (dw <= 0 || dh <= 0) return true;

    let source: CanvasImageSource = entry.sheet;
    let src = frameSrcRect(def, idx);
    if (opts.tint || opts.grayscale) {
      const varSheet = this.variant(name, entry, opts);
      if (varSheet) {
        source = varSheet;
        // Variant canvases hold just this frame's strip at origin.
        src = { ...src, x: src.x - def.x, y: 0 };
      }
    }

    ctx.save();
    if (opts.mirror) {
      ctx.translate(Math.round(x) + dw, Math.round(y));
      ctx.scale(-1, 1);
    } else {
      ctx.translate(Math.round(x), Math.round(y));
    }
    ctx.drawImage(source, src.x, src.y, src.w, src.h, 0, 0, dw, dh);
    ctx.restore();
    return true;
  }

  /** Draw a 9-slice frame stretched over the given rectangle. */
  drawNineSlice(ctx: CanvasRenderingContext2D, name: string, x: number, y: number, w: number, h: number): boolean {
    const entry = this.frames.get(name);
    if (!entry) return false;
    for (const p of nineSliceRects(entry.def, { x, y, w, h })) {
      ctx.drawImage(entry.sheet, p.src.x, p.src.y, p.src.w, p.src.h, p.dst.x, p.dst.y, p.dst.w, p.dst.h);
    }
    return true;
  }

  /** Lazily bake and cache a tinted/desaturated copy of a frame's strip. */
  private variant(name: string, entry: LoadedFrame, opts: DrawOpts): HTMLCanvasElement | null {
    const key = opts.tint ? `${name}|tint:${opts.tint}` : `${name}|gray`;
    const cached = this.variants.get(key);
    if (cached) return cached;

    const { def } = entry;
    const canvas = document.createElement('canvas');
    canvas.width = def.w;
    canvas.height = def.h;
    const c = canvas.getContext('2d');
    if (!c) return null;
    c.drawImage(entry.sheet, def.x, def.y, def.w, def.h, 0, 0, def.w, def.h);

    if (opts.tint) {
      // Solid-colour silhouette: matches the procedural hurt flash, which
      // paints the whole body red.
      c.globalCompositeOperation = 'source-in';
      c.fillStyle = opts.tint;
      c.fillRect(0, 0, def.w, def.h);
    } else {
      const img = c.getImageData(0, 0, def.w, def.h);
      const d = img.data;
      for (let i = 0; i < d.length; i += 4) {
        const lum = Math.round(0.299 * d[i]! + 0.587 * d[i + 1]! + 0.114 * d[i + 2]!);
        d[i] = d[i + 1] = d[i + 2] = lum;
      }
      c.putImageData(img, 0, 0);
    }
    this.variants.set(key, canvas);
    return canvas;
  }
}

/** The game-wide sprite store. Empty (all fallbacks) until loadSprites(). */
export const sprites = new SpriteStore();

/**
 * Fetch and register every atlas in the manifest. Individual atlases fail
 * soft (missing → info, malformed → error); the game renders procedurally
 * for whatever didn't load.
 */
export async function loadSprites(): Promise<void> {
  await Promise.all(ATLAS_URLS.map((url) => loadAtlas(url)));
  console.info(`[sprites] ready — ${sprites.count} frames registered`);
}

async function loadAtlas(url: string): Promise<void> {
  let res: Response;
  try {
    res = await fetch(url);
  } catch (e) {
    console.error(`[sprites] ${url}: fetch failed`, e);
    return;
  }
  // Missing atlases are an expected state. Vite's dev server answers unknown
  // paths with index.html + 200 (SPA fallback), so "not JSON" means missing
  // just like a real 404 does.
  if (!res.ok || !(res.headers.get('content-type') ?? '').includes('json')) {
    console.info(`[sprites] no atlas at ${url} — procedural art for that category`);
    return;
  }

  let doc: AtlasDoc;
  try {
    doc = JSON.parse(await res.text()) as AtlasDoc;
  } catch (e) {
    console.error(`[sprites] ${url}: invalid JSON — ${String(e)}`);
    return;
  }
  const problems = validateAtlas(doc, url);
  if (problems.length > 0) {
    console.error(`[sprites] ${url} rejected:\n${problems.join('\n')}`);
    return;
  }

  const sheetUrl = url.slice(0, url.lastIndexOf('/') + 1) + doc.meta.image;
  const sheet = new Image();
  sheet.src = sheetUrl;
  try {
    await sheet.decode();
  } catch {
    console.error(`[sprites] ${url}: image "${sheetUrl}" failed to load`);
    return;
  }
  if (sheet.naturalWidth !== doc.meta.size.w || sheet.naturalHeight !== doc.meta.size.h) {
    console.error(
      `[sprites] ${url}: meta.size ${doc.meta.size.w}x${doc.meta.size.h} != image ${sheet.naturalWidth}x${sheet.naturalHeight}`,
    );
    return;
  }
  sprites.register(doc, sheet, url);
}

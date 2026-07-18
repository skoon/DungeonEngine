/**
 * Canvas setup and pixel-perfect presentation.
 *
 * All game drawing targets a fixed 640x400 backbuffer (VGA-era aspect).
 * present() blits it to a display canvas at the largest integer scale that
 * fits the window, computed in *device* pixels so the result stays crisp on
 * fractional devicePixelRatio displays (common on Windows at 125%/150%).
 */

export const NATIVE_WIDTH = 640;
export const NATIVE_HEIGHT = 400;

export class Screen {
  /** Draw target for all game rendering, always 640x400. */
  readonly ctx: CanvasRenderingContext2D;

  private readonly backbuffer: HTMLCanvasElement;
  private readonly display: HTMLCanvasElement;
  private readonly displayCtx: CanvasRenderingContext2D;
  private currentScale = 0;

  constructor(container: HTMLElement) {
    this.backbuffer = document.createElement('canvas');
    this.backbuffer.width = NATIVE_WIDTH;
    this.backbuffer.height = NATIVE_HEIGHT;
    this.ctx = get2d(this.backbuffer);
    // Sprites scale nearest-neighbour; smoothing would blur pixel art.
    this.ctx.imageSmoothingEnabled = false;

    this.display = document.createElement('canvas');
    container.appendChild(this.display);
    this.displayCtx = get2d(this.display);

    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  /** Integer scale factor currently in use (device pixels per game pixel). */
  get scale(): number {
    return this.currentScale;
  }

  /**
   * Map a client (mouse) coordinate to backbuffer pixel space, or null if
   * it falls outside the canvas. Uses the CSS rect so it is independent of
   * devicePixelRatio.
   */
  clientToBackbuffer(clientX: number, clientY: number): { x: number; y: number } | null {
    const rect = this.display.getBoundingClientRect();
    if (clientX < rect.left || clientY < rect.top || clientX >= rect.right || clientY >= rect.bottom) {
      return null;
    }
    return {
      x: ((clientX - rect.left) / rect.width) * NATIVE_WIDTH,
      y: ((clientY - rect.top) / rect.height) * NATIVE_HEIGHT,
    };
  }

  present(): void {
    this.displayCtx.imageSmoothingEnabled = false;
    this.displayCtx.drawImage(
      this.backbuffer,
      0,
      0,
      this.display.width,
      this.display.height,
    );
  }

  private resize(): void {
    const dpr = window.devicePixelRatio || 1;
    const availW = window.innerWidth * dpr;
    const availH = window.innerHeight * dpr;
    const scale = Math.max(
      1,
      Math.floor(Math.min(availW / NATIVE_WIDTH, availH / NATIVE_HEIGHT)),
    );
    this.currentScale = scale;

    // Canvas bitmap sized in device pixels; CSS size maps it back so one
    // bitmap pixel lands on exactly one device pixel.
    this.display.width = NATIVE_WIDTH * scale;
    this.display.height = NATIVE_HEIGHT * scale;
    this.display.style.width = `${(NATIVE_WIDTH * scale) / dpr}px`;
    this.display.style.height = `${(NATIVE_HEIGHT * scale) / dpr}px`;

    this.present();
  }
}

function get2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('Canvas 2D context unavailable');
  return ctx;
}

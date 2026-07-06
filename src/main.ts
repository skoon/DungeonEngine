import { EventBus } from './core/events';
import { parseMap } from './core/mapParser';
import { World } from './core/world';
import { Rng } from './core/rng';
import { level1 } from './data/maps/level1';
import { Screen } from './render/screen';
import { drawChrome } from './render/chrome';
import { drawViewport } from './render/viewport';
import { drawMinimap } from './render/minimap';
import { drawPartyPanel } from './render/partyPanel';
import { LogPanel } from './render/logPanel';
import { LOG, contains } from './render/layout';
import { bindKeyboard } from './input/input';
import { startLoop } from './loop';

const container = document.getElementById('app');
if (!container) throw new Error('#app container missing');

const screen = new Screen(container);
const bus = new EventBus();
const level = parseMap(level1);
const world = new World(level, bus, new Rng(Date.now() >>> 0));
const logPanel = new LogPanel(bus);

// Movement/interaction keys drive the World; its events feed the log.
bindKeyboard({
  forward: () => world.stepForward(),
  back: () => world.stepBack(),
  strafeLeft: () => world.strafeLeft(),
  strafeRight: () => world.strafeRight(),
  turnLeft: () => world.turnLeft(),
  turnRight: () => world.turnRight(),
  use: () => world.use(),
});

// Mouse-wheel scrollback over the log pane.
window.addEventListener(
  'wheel',
  (ev) => {
    const p = screen.clientToBackbuffer(ev.clientX, ev.clientY);
    if (!p || !contains(LOG, p.x, p.y)) return;
    ev.preventDefault();
    logPanel.scrollBy(ev.deltaY < 0 ? 1 : -1);
  },
  { passive: false },
);

// Debug view toggles: M swaps the first-person view for the top-down map
// (which lives on forever as a debug aid, plan M3); G overlays frustum slots.
const debug = { minimap: false, slots: false };
window.addEventListener('keydown', (ev) => {
  const k = ev.key.toLowerCase();
  if (k === 'm') debug.minimap = !debug.minimap;
  else if (k === 'g') debug.slots = !debug.slots;
});

bus.emit({ type: 'log/message', channel: 'system', text: `You enter ${level.name}.` });
bus.emit({ type: 'log/message', channel: 'ambient', text: 'WASD/arrows move, Q/E turn, Space use. M=map G=grid.' });

function renderFrame(): void {
  const { ctx } = screen;
  const pose = world.party.getPose();
  drawChrome(ctx);
  if (debug.minimap) drawMinimap(ctx, level, pose);
  else drawViewport(ctx, level, pose, { showSlots: debug.slots });
  drawPartyPanel(ctx, pose.facing);
  logPanel.draw(ctx);
  screen.present();
}

startLoop({
  update: (tick) => {
    world.tick(100); // one sim tick = 100ms; advances door animations
    bus.emit({ type: 'sim/tick', tick });
  },
  render: renderFrame,
});

// Dev-only: lets a hidden preview tab (rAF suspended) force a frame and
// inspect world state for verification. Stripped from production builds.
if (import.meta.env.DEV) {
  Object.assign(window as unknown as Record<string, unknown>, { __frame: renderFrame, __world: world });
}

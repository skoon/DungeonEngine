import { EventBus } from './core/events';
import { parseMap } from './core/mapParser';
import { Party } from './core/party';
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
const party = new Party(level, bus);
const logPanel = new LogPanel(bus);

// Movement keys drive the core Party; its emitted events feed the log.
bindKeyboard({
  forward: () => party.stepForward(),
  back: () => party.stepBack(),
  strafeLeft: () => party.strafeLeft(),
  strafeRight: () => party.strafeRight(),
  turnLeft: () => party.turnLeft(),
  turnRight: () => party.turnRight(),
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
bus.emit({ type: 'log/message', channel: 'ambient', text: 'WASD/arrows move, Q/E turn. M=map G=grid.' });

function renderFrame(): void {
  const { ctx } = screen;
  const pose = party.getPose();
  drawChrome(ctx);
  if (debug.minimap) drawMinimap(ctx, level, pose);
  else drawViewport(ctx, level, pose, { showSlots: debug.slots });
  drawPartyPanel(ctx, pose.facing);
  logPanel.draw(ctx);
  screen.present();
}

startLoop({
  update: (tick) => {
    bus.emit({ type: 'sim/tick', tick });
  },
  render: renderFrame,
});

// Dev-only: lets a hidden preview tab (rAF suspended) force a frame for
// verification. Stripped from production builds.
if (import.meta.env.DEV) {
  (window as unknown as { __frame: () => void }).__frame = renderFrame;
}

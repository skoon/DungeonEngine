import { EventBus } from './core/events';
import { parseMap } from './core/mapParser';
import { World } from './core/world';
import { Rng } from './core/rng';
import { Roster } from './core/roster';
import { cellAt } from './core/dungeon';
import type { Item } from './core/item';
import { type InvContext, pickUp, placeInto } from './core/inventory';
import { level1 } from './data/maps/level1';
import { defaultParty } from './data/party';
import { Screen } from './render/screen';
import { drawChrome } from './render/chrome';
import { drawViewport } from './render/viewport';
import { drawMinimap } from './render/minimap';
import { drawPartyPanel } from './render/partyPanel';
import { LogPanel } from './render/logPanel';
import { buildPlacements, drawInventory, navigate } from './render/inventoryOverlay';
import { LOG, contains } from './render/layout';
import { bindKeyboard } from './input/input';
import { startLoop } from './loop';

const container = document.getElementById('app');
if (!container) throw new Error('#app container missing');

const screen = new Screen(container);
const bus = new EventBus();
const level = parseMap(level1);
const roster = new Roster(defaultParty());
const world = new World(level, bus, new Rng(Date.now() >>> 0), roster);
const logPanel = new LogPanel(bus);

// --- Inventory overlay state (pauses the sim while open) -------------------
const placements = buildPlacements(roster);
const inv: { open: boolean; cursor: number; held: Item | null; ctx: InvContext } = {
  open: false,
  cursor: 0,
  held: null,
  ctx: { roster, floor: [] },
};

function openInventory(): void {
  const pos = world.party.getPose().pos;
  const cell = cellAt(level, pos.x, pos.y);
  if (cell && !cell.items) cell.items = [];
  inv.ctx = { roster, floor: cell?.items ?? [] };
  inv.open = true;
}
function closeInventory(): void {
  if (inv.held) {
    inv.ctx.floor.push(inv.held); // don't lose the item on the cursor
    inv.held = null;
  }
  inv.open = false;
}
function grabOrPlace(): void {
  const ref = placements[inv.cursor]?.ref;
  if (!ref) return;
  if (inv.held === null) {
    const it = pickUp(inv.ctx, ref);
    if (it) inv.held = it;
  } else {
    inv.held = placeInto(inv.ctx, ref, inv.held);
  }
}

// Movement/interaction keys drive the World — but only when not in a menu.
bindKeyboard({
  forward: () => !inv.open && world.stepForward(),
  back: () => !inv.open && world.stepBack(),
  strafeLeft: () => !inv.open && world.strafeLeft(),
  strafeRight: () => !inv.open && world.strafeRight(),
  turnLeft: () => !inv.open && world.turnLeft(),
  turnRight: () => !inv.open && world.turnRight(),
  use: () => !inv.open && world.use(),
});

// Inventory + debug keys.
const NAV: Record<string, 'up' | 'down' | 'left' | 'right'> = {
  arrowup: 'up', w: 'up', arrowdown: 'down', s: 'down',
  arrowleft: 'left', a: 'left', arrowright: 'right', d: 'right',
};
const debug = { minimap: false, slots: false };
window.addEventListener('keydown', (ev) => {
  const k = ev.key.toLowerCase();
  if (k === 'i') {
    inv.open ? closeInventory() : openInventory();
    ev.preventDefault();
    return;
  }
  if (inv.open) {
    if (k === 'escape') return closeInventory();
    if (ev.repeat) return;
    const nav = NAV[k];
    if (nav) inv.cursor = navigate(placements, inv.cursor, nav);
    else if (k === 'enter' || k === ' ') grabOrPlace();
    ev.preventDefault();
    return;
  }
  if (k >= '1' && k <= '4') world.attack(Number(k) - 1);
  else if (k === 'm') debug.minimap = !debug.minimap;
  else if (k === 'g') debug.slots = !debug.slots;
});

// Mouse-wheel scrollback over the log pane.
window.addEventListener(
  'wheel',
  (ev) => {
    if (inv.open) return;
    const p = screen.clientToBackbuffer(ev.clientX, ev.clientY);
    if (!p || !contains(LOG, p.x, p.y)) return;
    ev.preventDefault();
    logPanel.scrollBy(ev.deltaY < 0 ? 1 : -1);
  },
  { passive: false },
);

bus.emit({ type: 'log/message', channel: 'system', text: `You enter ${level.name}.` });
bus.emit({ type: 'log/message', channel: 'ambient', text: 'Move WASD/arrows, turn Q/E, use Space, attack 1-4, inv I.' });

function renderFrame(): void {
  const { ctx } = screen;
  if (inv.open) {
    drawInventory(ctx, inv.ctx, placements, inv.cursor, inv.held);
    screen.present();
    return;
  }
  const pose = world.party.getPose();
  drawChrome(ctx);
  if (debug.minimap) drawMinimap(ctx, level, pose);
  else drawViewport(ctx, level, pose, world.monsters, { showSlots: debug.slots });
  drawPartyPanel(ctx, roster, pose.facing);
  logPanel.draw(ctx);
  screen.present();
}

startLoop({
  update: (tick) => {
    if (!inv.open) world.tick(100); // sim frozen while the menu is open
    bus.emit({ type: 'sim/tick', tick });
  },
  render: renderFrame,
});

// Dev-only hooks for verifying under a hidden preview tab. Stripped in prod.
if (import.meta.env.DEV) {
  Object.assign(window as unknown as Record<string, unknown>, {
    __frame: renderFrame,
    __world: world,
    __roster: roster,
    __inv: inv,
    __placements: placements,
  });
}

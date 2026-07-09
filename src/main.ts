import { EventBus } from './core/events';
import { parseMap } from './core/mapParser';
import { World } from './core/world';
import { Rng } from './core/rng';
import { Roster } from './core/roster';
import { cellAt } from './core/dungeon';
import type { Item } from './core/item';
import { type InvContext, pickUp, placeInto } from './core/inventory';
import { dungeonMaps, TOWN_INDEX, TOWN_ENTRANCE } from './data/maps';
import { defaultParty } from './data/party';
import { hasSave, loadFromStorage, saveToStorage } from './save/save';
import { Screen } from './render/screen';
import { drawChrome } from './render/chrome';
import { drawViewport, pickViewport } from './render/viewport';
import { drawMinimap } from './render/minimap';
import { drawPartyPanel } from './render/partyPanel';
import { LogPanel } from './render/logPanel';
import { buildPlacements, drawInventory, hitPlacement, navigate } from './render/inventoryOverlay';
import { buildSpellEntries, drawSpellbook, hitEntry, navigateList, type SpellEntry } from './render/spellOverlay';
import { buildTitleItems, drawTitle, hitTitle, type TitleItem } from './render/titleScreen';
import { buildControls, drawCreate, hitControl, type Control } from './render/createScreen';
import {
  buildTownRows, drawTownOverlay, hitTownRow, type TownMode, type TownRow,
} from './render/townOverlay';
import {
  CLASS_ORDER, type CreationMember, buildParty, createMember, defaultCreationParty, randomName, rollStats,
} from './data/creation';
import { drawHeaderButtons, drawMovePad } from './render/controls';
import {
  CLOSE_BUTTON, LOG, MOVE_BUTTONS, PARTY, PARTY_CARDS, UI_BUTTONS, VIEWPORT,
  type MoveId, contains, handSlotRect, portraitRect,
} from './render/layout';
import { GameAudio } from './audio/audio';
import { bindKeyboard } from './input/input';
import { startLoop } from './loop';

const container = document.getElementById('app');
if (!container) throw new Error('#app container missing');

const screen = new Screen(container);
const bus = new EventBus();
const levels = dungeonMaps.map((m) => parseMap(m));
const roster = new Roster(defaultParty());
const rng = new Rng(Date.now() >>> 0);
const world = new World(levels, bus, rng, roster);
world.setTown(TOWN_INDEX, TOWN_ENTRANCE.pos, TOWN_ENTRANCE.facing); // Town Portal destination
const logPanel = new LogPanel(bus);
const audio = new GameAudio();
audio.attach(bus);

// The active level changes as the party descends; `level` tracks it for
// coordinate-space lookups (inventory ground, etc.).
let level = world.level;
bus.on('level/changed', () => {
  level = world.level;
  saveToStorage(world, roster, rng); // autosave on stairs/pit (plan M9)
});

// --- Overlay + interaction state -------------------------------------------
const placements = buildPlacements(roster);
const inv: { open: boolean; cursor: number; held: Item | null; ctx: InvContext } = {
  open: false, cursor: 0, held: null, ctx: { roster, floor: [] },
};
const spellbook: { open: boolean; cursor: number; entries: SpellEntry[] } = {
  open: false, cursor: 0, entries: [],
};
// Town-service overlay (plan M-DR5): opens on the raise / recruit town cells.
const townUi: { open: boolean; mode: TownMode; cursor: number; rows: TownRow[]; candidate: CreationMember | null } = {
  open: false, mode: 'raise', cursor: 0, rows: [], candidate: null,
};
let swapSel: number | null = null; // formation-swap: first-picked card
let mouse: { x: number; y: number } | null = null;

// Title screen gates the start of play; New Game routes through creation.
let mode: 'title' | 'create' | 'play' = 'title';
const title: { cursor: number; items: TitleItem[] } = { cursor: 0, items: buildTitleItems(hasSave()) };
const creation: { members: CreationMember[]; focus: number; controls: Control[] } = {
  members: [], focus: 0, controls: buildControls(),
};

function chooseTitle(id: 'new' | 'continue'): void {
  if (id === 'continue') {
    loadGame();
    mode = 'play';
  } else {
    creation.members = defaultCreationParty(rng);
    creation.focus = 0;
    mode = 'create';
  }
}

function cycleClass(member: number, dir: number): void {
  const m = creation.members[member];
  if (!m) return;
  const i = CLASS_ORDER.indexOf(m.clazz);
  m.clazz = CLASS_ORDER[(i + dir + CLASS_ORDER.length) % CLASS_ORDER.length]!;
}
function reroll(member: number): void {
  const m = creation.members[member];
  if (m) m.stats = rollStats(rng);
}
function beginParty(): void {
  buildParty(creation.members).forEach((c, i) => {
    roster.members[i] = c;
    roster.hurt[i] = 0;
    roster.healFlash[i] = 0;
  });
  mode = 'play';
}

function handleCreateKey(ev: KeyboardEvent, k: string): void {
  const len = creation.controls.length;
  const c = creation.controls[creation.focus]!;
  ev.preventDefault();

  if (k === 'enter') {
    if (c.kind === 'begin') beginParty();
    else if (c.kind === 'reroll') reroll(c.member);
    else if (c.kind === 'rerollAll') creation.members.forEach((_, i) => reroll(i));
    else creation.focus = (creation.focus + 1) % len; // name/class -> advance
    return;
  }
  if (k === 'tab' || k === 'arrowdown') { creation.focus = (creation.focus + 1) % len; return; }
  if (k === 'arrowup') { creation.focus = (creation.focus - 1 + len) % len; return; }
  if (c.kind === 'class' && (k === 'arrowleft' || k === 'arrowright')) {
    cycleClass(c.member, k === 'arrowleft' ? -1 : 1);
    return;
  }
  if (c.kind === 'name') {
    const m = creation.members[c.member]!;
    if (k === 'backspace') m.name = m.name.slice(0, -1);
    else if (ev.key.length === 1 && !ev.ctrlKey && !ev.metaKey && /[A-Za-z '-]/.test(ev.key) && m.name.length < 12) {
      m.name += ev.key;
    }
  }
}

const anyMenuOpen = (): boolean => inv.open || spellbook.open || townUi.open;

// --- Town Hub services (plan M-DR5) ----------------------------------------
bus.on('town/service', (e) => {
  if (e.service === 'raise' || e.service === 'recruit') openTown(e.service);
});

function rollCandidate(): CreationMember {
  const taken = roster.members.map((m) => m.name);
  return { name: randomName(rng, taken), clazz: CLASS_ORDER[rng.int(0, 3)]!, stats: rollStats(rng) };
}
function rebuildTownRows(): void {
  townUi.rows = buildTownRows(townUi.mode, roster);
  if (townUi.cursor >= townUi.rows.length) townUi.cursor = 0;
}
function openTown(mode: TownMode): void {
  townUi.open = true;
  townUi.mode = mode;
  townUi.cursor = 0;
  townUi.candidate = mode === 'recruit' ? rollCandidate() : null;
  rebuildTownRows();
  inv.open = false;
  spellbook.open = false;
}
function closeTown(): void {
  townUi.open = false;
}
function cycleCandidateClass(dir: number): void {
  const c = townUi.candidate;
  if (!c) return;
  const i = CLASS_ORDER.indexOf(c.clazz);
  c.clazz = CLASS_ORDER[(i + dir + CLASS_ORDER.length) % CLASS_ORDER.length]!;
}
function activateTownRow(i: number): void {
  const row = townUi.rows[i];
  if (!row) return;
  if (row.kind === 'reroll') {
    if (townUi.candidate) townUi.candidate.stats = rollStats(rng);
  } else if (row.kind === 'class') {
    cycleCandidateClass(1);
  } else if (row.kind === 'raise') {
    world.raiseDead(row.member);
    rebuildTownRows();
  } else if (row.kind === 'hire') {
    if (townUi.candidate && world.replaceMember(row.member, createMember(townUi.candidate, row.member))) {
      closeTown();
    }
  }
}
function handleTownKey(k: string): void {
  const n = townUi.rows.length;
  if (k === 'escape' || k === 'x') closeTown();
  else if (k === 'arrowup' || k === 'w') townUi.cursor = (townUi.cursor + n - 1) % n;
  else if (k === 'arrowdown' || k === 's') townUi.cursor = (townUi.cursor + 1) % n;
  else if (k === 'arrowleft' && townUi.mode === 'recruit') cycleCandidateClass(-1);
  else if (k === 'arrowright' && townUi.mode === 'recruit') cycleCandidateClass(1);
  else if (k === 'enter' || k === ' ') activateTownRow(townUi.cursor);
}
function onTownClick(x: number, y: number): void {
  if (contains(CLOSE_BUTTON, x, y)) return closeTown();
  const idx = hitTownRow(townUi.rows.length, x, y);
  if (idx >= 0) {
    townUi.cursor = idx;
    activateTownRow(idx);
  }
}

function openInventory(): void {
  const pos = world.party.getPose().pos;
  const cell = cellAt(level, pos.x, pos.y);
  if (cell && !cell.items) cell.items = [];
  inv.ctx = { roster, floor: cell?.items ?? [] };
  inv.open = true;
  spellbook.open = false;
}
function closeInventory(): void {
  if (inv.held) {
    inv.ctx.floor.push(inv.held);
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
function openSpellbook(): void {
  spellbook.entries = buildSpellEntries(roster); // refresh after any swap
  spellbook.cursor = 0;
  spellbook.open = true;
  inv.open = false;
}

const MOVE: Record<MoveId, () => void> = {
  forward: () => world.stepForward(),
  back: () => world.stepBack(),
  strafeLeft: () => world.strafeLeft(),
  strafeRight: () => world.strafeRight(),
  turnLeft: () => world.turnLeft(),
  turnRight: () => world.turnRight(),
};

// --- Keyboard (unchanged bindings, still fully playable) --------------------
// Movement acts only during play (not on the title screen or in a menu).
const canAct = (): boolean => mode === 'play' && !anyMenuOpen();
bindKeyboard({
  forward: () => canAct() && world.stepForward(),
  back: () => canAct() && world.stepBack(),
  strafeLeft: () => canAct() && world.strafeLeft(),
  strafeRight: () => canAct() && world.strafeRight(),
  turnLeft: () => canAct() && world.turnLeft(),
  turnRight: () => canAct() && world.turnRight(),
  use: () => canAct() && world.use(),
});

const NAV: Record<string, 'up' | 'down' | 'left' | 'right'> = {
  arrowup: 'up', w: 'up', arrowdown: 'down', s: 'down',
  arrowleft: 'left', a: 'left', arrowright: 'right', d: 'right',
};
const debug = { minimap: false, slots: false };
window.addEventListener('keydown', (ev) => {
  audio.unlock(); // browsers only permit audio after a user gesture
  const k = ev.key.toLowerCase();
  if (k === 'n' && mode !== 'create') { // in creation 'n' is a name keystroke
    audio.toggleMute();
    ev.preventDefault();
    return;
  }

  if (mode === 'create') {
    handleCreateKey(ev, k);
    return;
  }

  if (mode === 'title') {
    if (ev.repeat) return;
    const n = title.items.length;
    if (k === 'arrowup' || k === 'w') title.cursor = (title.cursor + n - 1) % n;
    else if (k === 'arrowdown' || k === 's') title.cursor = (title.cursor + 1) % n;
    else if (k === 'enter' || k === ' ') {
      const it = title.items[title.cursor];
      if (it?.enabled) chooseTitle(it.id);
    }
    ev.preventDefault();
    return;
  }

  if (townUi.open) {
    handleTownKey(k);
    ev.preventDefault();
    return;
  }

  if (k === 'i' && !spellbook.open) {
    inv.open ? closeInventory() : openInventory();
    ev.preventDefault();
    return;
  }
  if (k === 'c' && !inv.open) {
    spellbook.open ? (spellbook.open = false) : openSpellbook();
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
  if (spellbook.open) {
    if (k === 'escape') { spellbook.open = false; return; }
    if (ev.repeat) return;
    if (k === 'arrowup' || k === 'w') spellbook.cursor = navigateList(spellbook.entries.length, spellbook.cursor, -1);
    else if (k === 'arrowdown' || k === 's') spellbook.cursor = navigateList(spellbook.entries.length, spellbook.cursor, 1);
    else if (k === 'enter' || k === ' ') {
      const e = spellbook.entries[spellbook.cursor];
      if (e) world.cast(e.member, e.spellId);
      spellbook.open = false;
    }
    ev.preventDefault();
    return;
  }

  if (k >= '1' && k <= '4') world.attack(Number(k) - 1);
  else if (k === 'r') world.camp();
  else if (k === 'k') saveGame();
  else if (k === 'l') loadGame();
  else if (k === 'm') debug.minimap = !debug.minimap;
  else if (k === 'g') debug.slots = !debug.slots;
});

function saveGame(): void {
  saveToStorage(world, roster, rng);
  bus.emit({ type: 'game/saved' });
  bus.emit({ type: 'log/message', channel: 'system', text: 'Game saved.' });
}
function loadGame(): void {
  if (loadFromStorage(world, roster, rng)) {
    level = world.level;
    bus.emit({ type: 'game/loaded' });
    bus.emit({ type: 'log/message', channel: 'system', text: 'Game loaded.' });
  } else {
    bus.emit({ type: 'log/message', channel: 'system', text: 'No saved game found.' });
  }
}

// --- Pointer (mouse + touch) ------------------------------------------------
window.addEventListener('pointermove', (ev) => {
  mouse = screen.clientToBackbuffer(ev.clientX, ev.clientY);
});
window.addEventListener('pointerdown', (ev) => {
  audio.unlock();
  const p = screen.clientToBackbuffer(ev.clientX, ev.clientY);
  if (!p) return;
  ev.preventDefault();
  onPointerDown(p.x, p.y);
});

function onPointerDown(x: number, y: number): void {
  if (mode === 'title') {
    const idx = hitTitle(title.items, x, y);
    if (idx >= 0) chooseTitle(title.items[idx]!.id);
    return;
  }
  if (mode === 'create') {
    const idx = hitControl(creation.controls, x, y);
    if (idx < 0) return;
    creation.focus = idx;
    const c = creation.controls[idx]!;
    if (c.kind === 'class') cycleClass(c.member, 1);
    else if (c.kind === 'reroll') reroll(c.member);
    else if (c.kind === 'rerollAll') creation.members.forEach((_, i) => reroll(i));
    else if (c.kind === 'begin') beginParty();
    return;
  }
  if (townUi.open) return onTownClick(x, y);
  if (inv.open) return onInventoryClick(x, y);
  if (spellbook.open) return onSpellbookClick(x, y);

  // Move pad (overlays the viewport, so test it first).
  for (const b of MOVE_BUTTONS) if (contains(b.rect, x, y)) return MOVE[b.id]();
  // Header buttons.
  for (const b of UI_BUTTONS) if (contains(b.rect, x, y)) return b.id === 'bag' ? openInventory() : openSpellbook();

  if (contains(PARTY, x, y)) return onPartyClick(x, y);
  if (contains(VIEWPORT, x, y)) return onViewportClick(x, y);
}

function onPartyClick(x: number, y: number): void {
  for (let i = 0; i < roster.members.length; i++) {
    const port = portraitRect(i);
    if (port && contains(port, x, y)) return void openInventory();
    for (const hand of [0, 1] as const) {
      const hs = handSlotRect(i, hand);
      if (hs && contains(hs, x, y)) return world.attack(i, hand);
    }
    const card = PARTY_CARDS[i];
    if (card && contains(card, x, y)) return void selectForSwap(i);
  }
}

function selectForSwap(i: number): void {
  if (swapSel === null) swapSel = i;
  else if (swapSel === i) swapSel = null;
  else {
    roster.swap(swapSel, i);
    swapSel = null;
  }
}

function onViewportClick(x: number, y: number): void {
  const pick = pickViewport(level, world.party.getPose(), world.monsters, { x, y });
  if (!pick) return;
  if (pick.kind === 'attack') {
    world.attack(0);
    world.attack(1); // both front-rank members swing at the cell ahead
  } else if (pick.kind === 'use') {
    world.use();
  } else {
    world.takeFloorItems();
  }
}

function onInventoryClick(x: number, y: number): void {
  if (contains(CLOSE_BUTTON, x, y)) return closeInventory();
  const idx = hitPlacement(placements, x, y);
  if (idx >= 0) {
    inv.cursor = idx;
    grabOrPlace();
  }
}

function onSpellbookClick(x: number, y: number): void {
  if (contains(CLOSE_BUTTON, x, y)) { spellbook.open = false; return; }
  const idx = hitEntry(spellbook.entries.length, x, y);
  if (idx >= 0) {
    const e = spellbook.entries[idx];
    if (e) world.cast(e.member, e.spellId);
    spellbook.open = false;
  }
}

// Mouse-wheel scrollback over the log pane.
window.addEventListener(
  'wheel',
  (ev) => {
    if (anyMenuOpen()) return;
    const p = screen.clientToBackbuffer(ev.clientX, ev.clientY);
    if (!p || !contains(LOG, p.x, p.y)) return;
    ev.preventDefault();
    logPanel.scrollBy(ev.deltaY < 0 ? 1 : -1);
  },
  { passive: false },
);

bus.emit({ type: 'log/message', channel: 'system', text: `You enter ${level.name}.` });
bus.emit({
  type: 'log/message',
  channel: 'ambient',
  text: 'Rest R, save K, load L, sound N. Playable by mouse or keyboard.',
});

function renderFrame(): void {
  const { ctx } = screen;
  if (mode === 'title') {
    drawTitle(ctx, title.items, title.cursor);
    screen.present();
    return;
  }
  if (mode === 'create') {
    drawCreate(ctx, creation.members, creation.controls, creation.focus);
    screen.present();
    return;
  }
  if (inv.open) {
    drawInventory(ctx, inv.ctx, placements, inv.cursor, inv.held, mouse);
    screen.present();
    return;
  }
  if (spellbook.open) {
    drawSpellbook(ctx, spellbook.entries, spellbook.cursor);
    screen.present();
    return;
  }
  if (townUi.open) {
    drawTownOverlay(ctx, townUi.mode, roster, townUi.rows, townUi.cursor, townUi.candidate);
    screen.present();
    return;
  }
  const pose = world.party.getPose();
  drawChrome(ctx);
  if (debug.minimap) {
    drawMinimap(ctx, level, pose);
  } else {
    drawViewport(ctx, level, pose, {
      monsters: world.monsters,
      projectiles: world.projectiles,
      lit: world.isLit(),
      showSlots: debug.slots,
    });
    drawMovePad(ctx);
  }
  drawPartyPanel(ctx, roster, pose.facing, swapSel ?? undefined);
  drawHeaderButtons(ctx);
  logPanel.draw(ctx);
  screen.present();
}

startLoop({
  update: (tick) => {
    if (mode === 'play' && !anyMenuOpen()) world.tick(100); // frozen on title / in menus
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
    __spellbook: spellbook,
    __townUi: townUi,
    __level: level,
    __click: onPointerDown,
    __audio: audio,
    __mode: () => mode,
    __creation: creation,
  });
}

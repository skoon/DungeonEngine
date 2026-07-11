/**
 * Headless auto-battle harness (plan M12 balance pass). Pits a party against
 * a monster encounter and reports win rate / time / survivors over many
 * seeded runs, so balance changes can be *measured* instead of guessed.
 *
 * Two arenas capture the two shapes of difficulty:
 *   - 'corridor': enemies come single-file — only one can melee the party at
 *     a time. Good for reading a monster's raw 1-on-1 threat.
 *   - 'open': a room where enemies surround the party's cell and several
 *     strike each round while the party can only face (and melee) one way.
 *     This is what makes the crypt lethal.
 * `startHpPct` models arriving hurt (e.g. after a pit fall).
 *
 * Not shipped — a tooling module. Lives in src/sim so it can import core and
 * data; it never touches render/input.
 */

import { type Dir, type Vec2, translate } from './../core/grid';
import { EventBus } from '../core/events';
import { parseMap } from '../core/mapParser';
import { manhattan } from '../core/path';
import { Rng } from '../core/rng';
import { Roster } from '../core/roster';
import { World } from '../core/world';
import { type Character, isDisabled } from '../core/character';
import { applyLevelUps, xpToReach } from '../core/leveling';
import { defaultParty } from '../data/party';
import { MONSTERS } from '../data/monsters';
import type { MonsterSpec } from '../core/mapParser';

type Arena = 'corridor' | 'open';

const CORRIDOR = '#################\n#>..............#\n#################';
// A 5x5 room, party at the centre (3,3).
const OPEN = '#######\n#.....#\n#.....#\n#..>..#\n#.....#\n#.....#\n#######';
// Cells around the centre where enemies materialise and close in.
const RING: Vec2[] = [
  { x: 1, y: 3 }, { x: 5, y: 3 }, { x: 3, y: 1 }, { x: 3, y: 5 },
  { x: 1, y: 1 }, { x: 5, y: 5 }, { x: 5, y: 1 }, { x: 1, y: 5 },
];

const TICK_MS = 100;
const MAX_MS = 60_000; // unresolved after a sim-minute = loss/stalemate

export interface Matchup {
  label: string;
  enemies: { species: string; count: number }[];
  partyLevel: number;
  arena?: Arena;
  /** Party starts at this fraction of full HP (default 1). */
  startHpPct?: number;
}

export interface BattleResult {
  win: boolean;
  timeMs: number;
  hpPct: number;
  deaths: number;
}

export interface MatchupStats {
  label: string;
  partyLevel: number;
  battles: number;
  winRate: number;
  avgTimeMsOnWin: number;
  avgHpPctOnWin: number;
  avgDeaths: number;
}

function makeParty(level: number, startHpPct: number): Character[] {
  const members = defaultParty();
  if (level > 1) {
    const lvlRng = new Rng(0xba5e + level);
    for (const c of members) {
      c.xp = xpToReach(level);
      applyLevelUps(c, lvlRng);
    }
  }
  if (startHpPct < 1) for (const c of members) c.hp.cur = Math.max(1, Math.round(c.hp.max * startHpPct));
  return members;
}

function spawns(enemies: Matchup['enemies'], arena: Arena): MonsterSpec[] {
  const list: MonsterSpec[] = [];
  const flat = enemies.flatMap((e) => {
    const species = MONSTERS[e.species];
    if (!species) throw new Error(`unknown species ${e.species}`);
    return Array.from({ length: e.count }, () => species);
  });
  flat.forEach((species, i) => {
    const pos = arena === 'open' ? RING[i % RING.length]! : { x: 14 - i, y: 1 };
    list.push({ x: pos.x, y: pos.y, species, facing: 3 });
  });
  return list;
}

function dirToward(from: Vec2, to: Vec2): Dir {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 1 : 3;
  return dy >= 0 ? 2 : 0;
}

function faceNearest(world: World): void {
  const pos = world.party.getPose().pos;
  let best: Vec2 | null = null;
  let bestD = Infinity;
  for (const m of world.monsters) {
    const d = manhattan(pos, m.pos);
    if (d < bestD) { bestD = d; best = m.pos; }
  }
  if (!best) return;
  const want = dirToward(pos, best);
  for (let guard = 0; guard < 4 && world.party.getPose().facing !== want; guard++) world.turnRight();
}

/** One round of party actions: face the nearest enemy, casters spend spells,
 * the front rank melees whatever is now ahead. Members on cooldown pass. */
function partyTurn(world: World, roster: Roster): void {
  faceNearest(world);
  const pose = world.party.getPose();
  const ahead = translate(pose.pos, pose.facing);
  const adjacent = world.monsterAt(ahead.x, ahead.y);
  const members = roster.members;
  const needsHeal = members.some((m) => !m.conditions.has('dead') && (m.conditions.has('unconscious') || m.hp.cur < m.hp.max * 0.5));

  members.forEach((c, i) => {
    if (isDisabled(c)) return;
    const knows = (id: string): boolean => c.spells.some((s) => s.id === id);
    const ready = Math.min(c.cooldowns[0], c.cooldowns[1]) <= 0;

    if (c.spellCooldown <= 0) {
      if (knows('cure_wounds') && needsHeal && c.mp.cur >= 4) return void world.cast(i, 'cure_wounds');
      if (knows('magic_missile') && c.mp.cur >= 3) return void world.cast(i, 'magic_missile');
    }
    if (!ready) return;

    if (adjacent) {
      const backRank = i >= 2;
      const weapon = c.hands.find((h) => h && h.tpl.slot === 'weapon');
      if (!backRank || weapon?.tpl.reach) world.attack(i);
    } else if (c.hands.some((h) => h?.tpl.thrown)) {
      world.attack(i);
    }
  });
}

export function simulateBattle(matchup: Matchup, seed: number): BattleResult {
  const arena = matchup.arena ?? 'corridor';
  const ascii = arena === 'open' ? OPEN : CORRIDOR;
  const level = parseMap({ name: 'arena', ascii, monsters: spawns(matchup.enemies, arena) });
  const bus = new EventBus();
  const roster = new Roster(makeParty(matchup.partyLevel, matchup.startHpPct ?? 1));
  const world = new World(level, bus, new Rng(seed), roster);

  let timeMs = 0;
  while (timeMs < MAX_MS) {
    if (world.monsters.length === 0) break;
    if (roster.everyoneDown()) break;
    partyTurn(world, roster);
    // In a corridor the party advances to close the gap (blocked once an
    // enemy is directly ahead); in the open they hold and let enemies come.
    if (arena === 'corridor') {
      const pose = world.party.getPose();
      const ahead = translate(pose.pos, pose.facing);
      if (!world.monsterAt(ahead.x, ahead.y)) world.stepForward();
    }
    world.tick(TICK_MS);
    timeMs += TICK_MS;
  }

  const totalMax = roster.members.reduce((s, c) => s + c.hp.max, 0);
  const totalCur = roster.members.reduce((s, c) => s + Math.max(0, c.hp.cur), 0);
  return {
    win: world.monsters.length === 0,
    timeMs,
    hpPct: totalMax > 0 ? totalCur / totalMax : 0,
    deaths: roster.members.filter((c) => c.conditions.has('dead')).length,
  };
}

export function runMatchup(matchup: Matchup, seeds = 30): MatchupStats {
  const results: BattleResult[] = [];
  for (let s = 0; s < seeds; s++) results.push(simulateBattle(matchup, 1000 + s * 7));
  const wins = results.filter((r) => r.win);
  const avg = (xs: number[]): number => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  return {
    label: matchup.label,
    partyLevel: matchup.partyLevel,
    battles: results.length,
    winRate: wins.length / results.length,
    avgTimeMsOnWin: Math.round(avg(wins.map((r) => r.timeMs))),
    avgHpPctOnWin: avg(wins.map((r) => r.hpPct)),
    avgDeaths: avg(results.map((r) => r.deaths)),
  };
}

export function formatReport(rows: MatchupStats[]): string {
  const head = ['Matchup', 'Lv', 'Win%', 'Time(s)', 'HP%@win', 'Deaths'];
  const body = rows.map((r) => [
    r.label,
    String(r.partyLevel),
    (r.winRate * 100).toFixed(0) + '%',
    (r.avgTimeMsOnWin / 1000).toFixed(1),
    (r.avgHpPctOnWin * 100).toFixed(0) + '%',
    r.avgDeaths.toFixed(2),
  ]);
  const widths = head.map((h, i) => Math.max(h.length, ...body.map((row) => row[i]!.length)));
  const line = (cols: string[]): string => cols.map((c, i) => c.padEnd(widths[i]!)).join('  ');
  return [line(head), widths.map((w) => '-'.repeat(w)).join('  '), ...body.map(line)].join('\n');
}

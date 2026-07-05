/**
 * Party position/facing and movement. Split into pure helpers (testable
 * without a bus) and a thin stateful controller that emits events for the
 * presentation layers (M2+).
 *
 * The party occupies exactly one cell and faces one direction. Movement is
 * discrete and relative to facing: stepping "left" strafes to the port side
 * without changing facing, whereas turning left rotates facing in place.
 */

import { type Dir, type Vec2, opposite, translate, turnLeft, turnRight } from './grid';
import { blockReason, type Level } from './dungeon';
import type { EventBus } from './events';

export interface Pose {
  pos: Vec2;
  facing: Dir;
}

export type StepDir = 'forward' | 'back' | 'left' | 'right';
export type TurnDir = 'left' | 'right';

/** Absolute direction a relative step resolves to, given a facing. */
export function stepDirection(facing: Dir, step: StepDir): Dir {
  switch (step) {
    case 'forward':
      return facing;
    case 'back':
      return opposite(facing);
    case 'left':
      return turnLeft(facing);
    case 'right':
      return turnRight(facing);
  }
}

export type StepResult =
  | { ok: true; pose: Pose }
  | { ok: false; reason: 'wall' | 'edge'; pose: Pose };

/** Pure attempt to step; returns the same pose unchanged when blocked. */
export function tryStep(level: Level, pose: Pose, step: StepDir): StepResult {
  const dir = stepDirection(pose.facing, step);
  const reason = blockReason(level, pose.pos, dir);
  if (reason) return { ok: false, reason, pose };
  return { ok: true, pose: { pos: translate(pose.pos, dir), facing: pose.facing } };
}

/** Pure turn; returns a new pose with rotated facing, same position. */
export function turned(pose: Pose, turn: TurnDir): Pose {
  const facing = turn === 'left' ? turnLeft(pose.facing) : turnRight(pose.facing);
  return { pos: { ...pose.pos }, facing };
}

/**
 * Stateful party controller. Holds the live pose, applies the pure helpers,
 * and emits semantic events (never formatted text — the log panel owns
 * wording, plan §3.5).
 */
export class Party {
  private pose: Pose;

  constructor(
    private readonly level: Level,
    private readonly bus: EventBus,
    start: Pose = clonePose(level.start),
  ) {
    this.pose = clonePose(start);
  }

  getPose(): Readonly<Pose> {
    return this.pose;
  }

  step(step: StepDir): boolean {
    const result = tryStep(this.level, this.pose, step);
    if (!result.ok) {
      this.bus.emit({ type: 'party/blocked', reason: result.reason, facing: this.pose.facing });
      return false;
    }
    const from = this.pose.pos;
    this.pose = result.pose;
    this.bus.emit({
      type: 'party/moved',
      x: this.pose.pos.x,
      y: this.pose.pos.y,
      facing: this.pose.facing,
      fromX: from.x,
      fromY: from.y,
    });
    return true;
  }

  turn(turn: TurnDir): void {
    this.pose = turned(this.pose, turn);
    this.bus.emit({ type: 'party/turned', facing: this.pose.facing });
  }

  stepForward(): boolean {
    return this.step('forward');
  }
  stepBack(): boolean {
    return this.step('back');
  }
  strafeLeft(): boolean {
    return this.step('left');
  }
  strafeRight(): boolean {
    return this.step('right');
  }
  turnLeft(): void {
    this.turn('left');
  }
  turnRight(): void {
    this.turn('right');
  }
}

function clonePose(pose: Pose): Pose {
  return { pos: { ...pose.pos }, facing: pose.facing };
}

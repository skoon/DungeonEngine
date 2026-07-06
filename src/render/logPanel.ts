/**
 * Message log — a pure subscriber to the event bus. The core emits semantic
 * events; this panel owns the wording and colour (plan §3.5), keeps a
 * ring buffer of recent lines, and renders the visible tail newest-at-bottom
 * with mouse-wheel scrollback.
 */

import { DIR_NAME } from '../core/grid';
import type { EventBus, GameEvent, LogChannel } from '../core/events';
import { CHANNEL_COLOR, COLORS } from './palette';
import { LOG, inset } from './layout';
import { LINE_HEIGHT, text } from './text';

const MAX_LINES = 200;
const TITLE_H = 12;

interface LogLine {
  text: string;
  color: string;
}

export class LogPanel {
  private readonly lines: LogLine[] = [];
  private readonly visible: number;
  /** Lines scrolled back from the newest; 0 = pinned to the bottom. */
  private scrollOffset = 0;

  constructor(bus: EventBus) {
    const content = inset(LOG, 5);
    this.visible = Math.floor((content.h - TITLE_H) / LINE_HEIGHT);
    bus.onAny((e) => this.handle(e));
  }

  private handle(e: GameEvent): void {
    switch (e.type) {
      case 'party/moved':
        this.push('ambient', `You move ${DIR_NAME[e.facing]}.`);
        break;
      case 'party/turned':
        this.push('ambient', `You turn to face ${DIR_NAME[e.facing]}.`);
        break;
      case 'party/blocked':
        this.push(
          'system',
          e.reason === 'wall' ? 'You bump into solid rock.' : 'A wall blocks your way.',
        );
        break;
      case 'log/message':
        this.push(e.channel, e.text);
        break;
      case 'sim/tick':
        break;
    }
  }

  private push(channel: LogChannel, str: string): void {
    this.lines.push({ text: str, color: CHANNEL_COLOR[channel] });
    if (this.lines.length > MAX_LINES) this.lines.shift();
    this.scrollOffset = 0; // new text snaps the view to the bottom
  }

  /** Positive = scroll toward older lines. */
  scrollBy(steps: number): void {
    const max = Math.max(0, this.lines.length - this.visible);
    this.scrollOffset = Math.max(0, Math.min(max, this.scrollOffset + steps));
  }

  draw(ctx: CanvasRenderingContext2D): void {
    const content = inset(LOG, 5);
    const end = this.lines.length - this.scrollOffset;
    const start = Math.max(0, end - this.visible);
    const shown = this.lines.slice(start, end);
    const top = content.y + TITLE_H;

    shown.forEach((line, i) => {
      // Anchor the newest line to the bottom of the well.
      const y = content.y + content.h - (shown.length - i) * LINE_HEIGHT;
      if (y >= top - LINE_HEIGHT) text(ctx, line.text, content.x, y, line.color);
    });

    if (this.scrollOffset > 0) {
      text(ctx, '^ scrollback', content.x + content.w - 68, top - TITLE_H + 1, COLORS.textDim);
    }
  }
}

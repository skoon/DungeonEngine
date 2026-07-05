import { EventBus } from './core/events';
import { Screen } from './render/screen';
import { drawTestPattern } from './render/testPattern';
import { startLoop } from './loop';

const container = document.getElementById('app');
if (!container) throw new Error('#app container missing');

const screen = new Screen(container);
const bus = new EventBus();

// M0 wiring proof: the sim emits tick events, presentation subscribes.
// From M2 on, the log panel subscribes here instead of console.
let currentTick = 0;
bus.on('sim/tick', (e) => {
  currentTick = e.tick;
  if (e.tick % 50 === 0) console.log(`[sim] tick ${e.tick}`);
});

startLoop({
  update: (tick) => {
    bus.emit({ type: 'sim/tick', tick });
  },
  render: () => {
    drawTestPattern(screen.ctx, currentTick, screen.scale);
    screen.present();
  },
});
